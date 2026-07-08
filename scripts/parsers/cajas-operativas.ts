import ExcelJS from "exceljs";
import {
  ubicarHeaders,
  leerCeldaNumerica,
  leerCeldaTexto,
  leerCeldaFecha,
  leerColorFondo,
  fechaAISO,
  esTextoDeTotales,
} from "./excel-utils";
import { esFormulaDeAjusteManual } from "./ajuste-detector";
import type { TitularRow } from "./catalogos";
import type { ResultadoParseoHoja, MovimientoParseado, FilaDescartada } from "./tipos";

/**
 * Parsea una hoja de "caja operativa" (2026.xlsx): FECHA | COD | TITULAR | CONCEPTO | $ | USD | TOTAL $ | TOTAL USD.
 * TITULAR es una fórmula VLOOKUP en el Excel original; acá se resuelve por join contra
 * el catálogo Titulares ya cargado, no por el valor cacheado de la fórmula.
 */
export function parsearCajaOperativa(
  sheet: ExcelJS.Worksheet,
  titularesPorCod: Map<number, TitularRow>
): ResultadoParseoHoja {
  const { filaHeaders, columnas } = ubicarHeaders(sheet, [
    { clave: "fecha", variantes: ["FECHA"] },
    { clave: "cod", variantes: ["COD", "COD."] },
    { clave: "concepto", variantes: ["CONCEPTO"], requerido: false },
    { clave: "monto", variantes: ["$"] },
    { clave: "usd", variantes: ["USD"], requerido: false },
    { clave: "totalArs", variantes: ["TOTAL $"], requerido: false },
    { clave: "totalUsd", variantes: ["TOTAL USD"], requerido: false },
  ]);

  const movimientos: MovimientoParseado[] = [];
  const filasDescartadas: FilaDescartada[] = [];
  let filaTotales: number | null = null;

  const maxRow = sheet.actualRowCount || sheet.rowCount;

  // Las columnas TOTAL $/TOTAL USD casi nunca tienen texto de header propio (son el
  // arrastre acumulado, no un dato con nombre) — cuando ubicarHeaders no las encuentra
  // por texto, se infieren por posición: son las dos columnas siguientes a USD (o a
  // "$" si no hay columna USD en esta hoja).
  const totalArsCol = columnas.totalArs ?? (columnas.usd ? columnas.usd + 1 : columnas.monto! + 1);
  const totalUsdCol = columnas.totalUsd ?? totalArsCol + 1;

  // El saldo inicial de arrastre puede estar en dos lugares distintos según la hoja:
  //  (a) una fila propia, sin fecha, justo después de los headers (caso general), o
  //  (b) pegado en la MISMA fila de los headers, en las columnas TOTAL $/TOTAL USD
  //      (caso ALICIA: fila 4 tiene "FECHA"/"COD"/... como texto Y el arrastre como
  //      número en G4/H4 a la vez). Si no se detecta (a), se prueba (b).
  let saldoArs = 0;
  let saldoUsd = 0;
  let filaInicio = filaHeaders + 1;
  const primeraFila = sheet.getRow(filaInicio);
  if (!leerCeldaFecha(primeraFila.getCell(columnas.fecha!))) {
    const seedArs = leerCeldaNumerica(primeraFila.getCell(totalArsCol)).valor;
    const seedUsd = leerCeldaNumerica(primeraFila.getCell(totalUsdCol)).valor;
    if (seedArs !== null || seedUsd !== null) {
      saldoArs = seedArs ?? 0;
      saldoUsd = seedUsd ?? 0;
      filaInicio = filaInicio + 1;
    }
  } else {
    const filaHeadersRow = sheet.getRow(filaHeaders);
    const seedArs = leerCeldaNumerica(filaHeadersRow.getCell(totalArsCol)).valor;
    const seedUsd = leerCeldaNumerica(filaHeadersRow.getCell(totalUsdCol)).valor;
    if (seedArs !== null || seedUsd !== null) {
      saldoArs = seedArs ?? 0;
      saldoUsd = seedUsd ?? 0;
    }
  }

  let totalSegunExcelArs: number | null = null;
  let totalSegunExcelUsd: number | null = null;
  // Respaldo para filas con monto real pero sin fecha reconocible (ni Date de Excel
  // ni texto en español) — se les asigna la última fecha válida vista, marcadas como
  // anomalía, en vez de perder la plata descartando la fila entera.
  let ultimaFechaValida: Date | null = null;

  for (let fila = filaInicio; fila <= maxRow; fila++) {
    const row = sheet.getRow(fila);
    const fechaCell = row.getCell(columnas.fecha!);
    let fechaDate = leerCeldaFecha(fechaCell);
    const fechaTexto = leerCeldaTexto(fechaCell);

    if (esTextoDeTotales(fechaTexto)) {
      filaTotales = fila;
      break;
    }

    const montoCell = row.getCell(columnas.monto!);
    const { valor: montoArsCelda, formula: formulaArs } = leerCeldaNumerica(montoCell);
    // Hay filas que son una compra/venta de dólares: sin nada en "$" pero con un
    // valor en "USD" (o viceversa). Leer USD acá, ANTES de decidir si se descarta
    // la fila, para no perder esos movimientos que no tienen componente en pesos.
    const usdCellTemprano = columnas.usd ? row.getCell(columnas.usd) : null;
    const montoUsdCelda = usdCellTemprano ? leerCeldaNumerica(usdCellTemprano).valor : null;
    const hayMonto = (montoArsCelda !== null && montoArsCelda !== 0) || (montoUsdCelda !== null && montoUsdCelda !== 0);

    let fechaEsRespaldo = false;
    if (!fechaDate) {
      if (!hayMonto) {
        continue; // fila de relleno vacía real (Excel reserva filas hasta 1000)
      }
      if (ultimaFechaValida) {
        fechaDate = ultimaFechaValida;
        fechaEsRespaldo = true;
      } else {
        // Hay monto pero todavía no vimos ninguna fecha válida antes en la hoja
        // para usar de respaldo — ahí sí no hay forma razonable de ubicarla.
        filasDescartadas.push({ fila, motivo: "monto_sin_fecha" });
        continue;
      }
    } else {
      ultimaFechaValida = fechaDate;
    }

    if (montoArsCelda === null && montoUsdCelda === null) {
      filasDescartadas.push({ fila, motivo: "fila_sin_monto" });
      continue;
    }

    // Si la fila solo tiene movimiento en USD, el monto en ARS de esta fila es 0
    // (no "sin dato") — la fila es válida igual, solo afecta el saldo en dólares.
    const montoArs = montoArsCelda ?? 0;

    const codTexto = leerCeldaTexto(row.getCell(columnas.cod!));
    let codTitular: number | null = null;
    let anomalia: string | null = fechaEsRespaldo ? "fecha_faltante" : null;
    if (codTexto) {
      const codNum = Number(codTexto);
      if (Number.isInteger(codNum)) {
        codTitular = codNum;
      } else {
        anomalia = anomalia ?? "cod_no_numerico";
      }
    }

    let titularResuelto: string | null = null;
    if (codTitular !== null) {
      const titular = titularesPorCod.get(codTitular);
      if (titular) {
        titularResuelto = titular.nombre;
      } else {
        anomalia = anomalia ?? "vlookup_error";
      }
    }

    const conceptoManual = columnas.concepto ? leerCeldaTexto(row.getCell(columnas.concepto)) : null;
    // Que falte solo la descripción (sin código ni concepto manual) no es una anomalía:
    // la fila sigue siendo válida si tiene fecha y monto. Solo se marca anomalía cuando
    // falta algo estructural: código no numérico o código sin match en Titulares (arriba).
    const descripcionFinal = conceptoManual ?? titularResuelto ?? "(sin descripcion)";

    const montoUsd = montoUsdCelda;

    const requiereJustificacion = esFormulaDeAjusteManual(formulaArs);

    saldoArs += montoArs;
    saldoUsd += montoUsd ?? 0;

    totalSegunExcelArs = leerCeldaNumerica(row.getCell(totalArsCol)).valor;
    totalSegunExcelUsd = leerCeldaNumerica(row.getCell(totalUsdCol)).valor;

    // El signo lo define el monto en ARS; si esta fila es puramente en USD (ARS=0),
    // el signo lo define el monto en USD en su lugar.
    const tipoMovimiento: "ingreso" | "egreso" =
      montoArs !== 0 ? (montoArs >= 0 ? "ingreso" : "egreso") : (montoUsd ?? 0) >= 0 ? "ingreso" : "egreso";

    movimientos.push({
      filaExcel: fila,
      fecha: fechaAISO(fechaDate),
      codTitular,
      titularResuelto,
      codCuenta: null,
      cuentaResuelta: null,
      conceptoManual,
      descripcionFinal,
      montoArs,
      montoUsd,
      tipoMovimiento,
      saldoAcumuladoArs: saldoArs,
      saldoAcumuladoUsd: saldoUsd,
      formulaOriginal: requiereJustificacion ? formulaArs : null,
      requiereJustificacion,
      anomalia,
      colorFondo: leerColorFondo(montoCell),
    });
  }

  return {
    movimientos,
    filaTotales,
    filasDescartadas,
    saldoInicialArs: saldoArs - movimientos.reduce((acc, m) => acc + m.montoArs, 0),
    saldoInicialUsd: saldoUsd - movimientos.reduce((acc, m) => acc + (m.montoUsd ?? 0), 0),
    totalSegunExcelArs,
    totalSegunExcelUsd,
  };
}
