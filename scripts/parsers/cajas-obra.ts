import ExcelJS from "exceljs";
import {
  normalizar,
  leerCeldaNumerica,
  leerCeldaTexto,
  leerCeldaFecha,
  leerColorFondo,
  fechaAISO,
  esTextoDeTotales,
} from "./excel-utils";
import { esFormulaDeAjusteManual } from "./ajuste-detector";
import type { TitularRow, CuentaRow } from "./catalogos";
import type { ResultadoParseoHoja, MovimientoParseado, FilaDescartada } from "./tipos";

interface ColumnasObra {
  filaHeaders: number;
  fechaCol: number;
  montoCol: number;
  codTitularCol: number;
  codCuentaCol: number | null;
  conceptoCol: number | null;
  usdCol: number | null;
  totalArsCol: number | null;
  totalUsdCol: number | null;
}

/**
 * Las hojas de obra (PALERMO, CENTRO, MERCAT, CAJA GENERAL) tienen DOS columnas
 * tituladas "COD" (titular y cuenta contable), y la fila/columna de headers varía
 * entre hojas (CAJA GENERAL los tiene en la fila 5, con una columna oculta de por medio).
 * Por eso se ubican por texto y posición relativa en vez de offsets fijos.
 */
function ubicarHeadersObra(sheet: ExcelJS.Worksheet, filaMax = 10): ColumnasObra {
  for (let fila = 1; fila <= filaMax; fila++) {
    const celdas: { texto: string; col: number }[] = [];
    sheet.getRow(fila).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (typeof cell.value === "string" && cell.value.trim() !== "") {
        celdas.push({ texto: normalizar(cell.value), col: colNumber });
      }
    });

    const fechaCol = celdas.find((c) => c.texto === "FECHA")?.col;
    const montoCol = celdas.find((c) => c.texto === "$")?.col;
    const codCols = celdas
      .filter((c) => c.texto === "COD" || c.texto === "COD.")
      .map((c) => c.col)
      .sort((a, b) => a - b);

    if (fechaCol && montoCol && codCols.length >= 1) {
      return {
        filaHeaders: fila,
        fechaCol,
        montoCol,
        codTitularCol: codCols[0],
        codCuentaCol: codCols[1] ?? null,
        conceptoCol:
          celdas.find((c) => ["CONCEPTO", "OBSERVACIONES", "DESCRIPCION"].includes(c.texto))?.col ??
          null,
        usdCol: celdas.find((c) => c.texto === "USD")?.col ?? null,
        totalArsCol: celdas.find((c) => c.texto === "TOTAL $")?.col ?? null,
        totalUsdCol: celdas.find((c) => c.texto === "TOTAL USD")?.col ?? null,
      };
    }
  }
  throw new Error(`No se pudieron ubicar los headers de la hoja de obra "${sheet.name}"`);
}

export function parsearCajaObra(
  sheet: ExcelJS.Worksheet,
  titularesPorCod: Map<number, TitularRow>,
  cuentasPorCod: Map<number, CuentaRow>
): ResultadoParseoHoja {
  const cols = ubicarHeadersObra(sheet);
  const movimientos: MovimientoParseado[] = [];
  const filasDescartadas: FilaDescartada[] = [];
  let filaTotales: number | null = null;

  const maxRow = sheet.actualRowCount || sheet.rowCount;

  let saldoArs = 0;
  let saldoUsd = 0;
  let filaInicio = cols.filaHeaders + 1;
  const primeraFila = sheet.getRow(filaInicio);
  if (!leerCeldaFecha(primeraFila.getCell(cols.fechaCol))) {
    const seedArs = cols.totalArsCol ? leerCeldaNumerica(primeraFila.getCell(cols.totalArsCol)).valor : null;
    const seedUsd = cols.totalUsdCol ? leerCeldaNumerica(primeraFila.getCell(cols.totalUsdCol)).valor : null;
    if (seedArs !== null || seedUsd !== null) {
      saldoArs = seedArs ?? 0;
      saldoUsd = seedUsd ?? 0;
      filaInicio += 1;
    }
  }

  let totalSegunExcelArs: number | null = null;
  let totalSegunExcelUsd: number | null = null;
  // Ver nota equivalente en cajas-operativas.ts.
  let ultimaFechaValida: Date | null = null;

  for (let fila = filaInicio; fila <= maxRow; fila++) {
    const row = sheet.getRow(fila);
    const fechaCell = row.getCell(cols.fechaCol);
    let fechaDate = leerCeldaFecha(fechaCell);
    const fechaTexto = leerCeldaTexto(fechaCell);

    if (esTextoDeTotales(fechaTexto)) {
      filaTotales = fila;
      break;
    }

    const montoCell = row.getCell(cols.montoCol);
    const { valor: montoArsCelda, formula: formulaArs } = leerCeldaNumerica(montoCell);
    // Ver nota equivalente en cajas-operativas.ts: hay filas de compra/venta de
    // dólares sin nada en "$", solo en "USD" — leerlo antes de descartar la fila.
    const montoUsdCelda = cols.usdCol ? leerCeldaNumerica(row.getCell(cols.usdCol)).valor : null;
    const hayMonto = (montoArsCelda !== null && montoArsCelda !== 0) || (montoUsdCelda !== null && montoUsdCelda !== 0);

    let fechaEsRespaldo = false;
    if (!fechaDate) {
      if (!hayMonto) {
        continue;
      }
      if (ultimaFechaValida) {
        fechaDate = ultimaFechaValida;
        fechaEsRespaldo = true;
      } else {
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

    const montoArs = montoArsCelda ?? 0;

    let anomalia: string | null = fechaEsRespaldo ? "fecha_faltante" : null;

    const codTitularTexto = leerCeldaTexto(row.getCell(cols.codTitularCol));
    let codTitular: number | null = null;
    if (codTitularTexto) {
      const n = Number(codTitularTexto);
      if (Number.isInteger(n)) codTitular = n;
      else anomalia = anomalia ?? "cod_no_numerico";
    }
    let titularResuelto: string | null = null;
    if (codTitular !== null) {
      const titular = titularesPorCod.get(codTitular);
      if (titular) titularResuelto = titular.nombre;
      else anomalia = anomalia ?? "vlookup_error";
    }

    let codCuenta: number | null = null;
    let cuentaResuelta: string | null = null;
    if (cols.codCuentaCol) {
      const codCuentaTexto = leerCeldaTexto(row.getCell(cols.codCuentaCol));
      if (codCuentaTexto) {
        const n = Number(codCuentaTexto);
        if (Number.isInteger(n)) {
          codCuenta = n;
          const cuenta = cuentasPorCod.get(n);
          if (cuenta) cuentaResuelta = cuenta.cuenta;
          else anomalia = anomalia ?? "vlookup_error";
        } else {
          anomalia = anomalia ?? "cod_no_numerico";
        }
      }
    }

    const conceptoManual = cols.conceptoCol ? leerCeldaTexto(row.getCell(cols.conceptoCol)) : null;
    // Que falte solo la descripción no es una anomalía (ver nota en cajas-operativas.ts).
    const descripcionFinal = conceptoManual ?? cuentaResuelta ?? titularResuelto ?? "(sin descripcion)";

    const montoUsd = montoUsdCelda;
    const requiereJustificacion = esFormulaDeAjusteManual(formulaArs);

    saldoArs += montoArs;
    saldoUsd += montoUsd ?? 0;

    if (cols.totalArsCol) totalSegunExcelArs = leerCeldaNumerica(row.getCell(cols.totalArsCol)).valor;
    if (cols.totalUsdCol) totalSegunExcelUsd = leerCeldaNumerica(row.getCell(cols.totalUsdCol)).valor;

    const tipoMovimiento: "ingreso" | "egreso" =
      montoArs !== 0 ? (montoArs >= 0 ? "ingreso" : "egreso") : (montoUsd ?? 0) >= 0 ? "ingreso" : "egreso";

    movimientos.push({
      filaExcel: fila,
      fecha: fechaAISO(fechaDate),
      codTitular,
      titularResuelto,
      codCuenta,
      cuentaResuelta,
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
