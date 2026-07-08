import ExcelJS from "exceljs";
import { textoOr, numeroOr0, fechaEstrictaIso } from "./excel-helpers";
import type { AlquilerMensual, Factura, Pago } from "./tipos";

/**
 * Porta contratoAlquileres/src/cbc_parser.py — extrae AlquilerMensual de la hoja
 * "CtasCtes" de un CBC (.xlsm). Offsets de columna reverse-engineered a mano contra
 * CBC_1er_Semestre_2026_LUCA.xlsm (ver módulo Python original, no documentados en
 * ningún lado más). NO tocar estos números sin re-verificar contra un CBC real —
 * es la parte más riesgosa de todo el port (ver plan de migración, "Riesgo principal").
 *
 * Los offsets 0-indexados de cbc_parser.py (_COL_*) se traducen a columnas
 * 1-indexadas de ExcelJS sumando 1 (ej. _COL_TIPO_FILA=3 → COL_TIPO_FILA=4).
 *
 * Estructura de la hoja:
 *   Todas las filas del bloque llevan proveedor (col I) y cuenta (col L) repetidos.
 *   El marcador de inicio/cierre está en col D:
 *     col D == 'D'        → inicio de bloque mes×proveedor
 *     col D == 'H'        → cierre de bloque
 *     col C in ('I','IE') → fila de detalle (compra o pago), leer col Q para tipo
 */

const HOJA = "CtasCtes";

const COL_TIPO_FILA = 4; // D: 'D'=inicio bloque, 'H'=cierre bloque
const COL_TIPO_REG = 3; // C: 'I'|'IE' = fila de detalle
const COL_PROVEEDOR = 9; // I → nombre proveedor
const COL_MES_HDR = 7; // G → mes string "Dic-25"
const COL_CUENTA = 12; // L → cuenta contable ("Alquileres Inmueble Gral.")
const COL_FECHA_MOV = 14; // N → fecha comprobante/pago
const COL_TIPO_MOV = 17; // Q → "Compra" | "Pago" | "Comp/Pago"
const COL_TIPO_CBTE = 24; // X → 4=factura, 7=sin factura
const COL_RAZON_SOC = 28; // AB → razón social emisor
const COL_CUIT = 29; // AC → CUIT
const COL_TOTAL_COMPRA = 40; // AN → total compra (negativo en CBC)
const COL_NRO_CHEQUE = 49; // AW → número cheque / "DD" / "dd"
const COL_MONTO_PAGO = 55; // BC → total pago (positivo)

export interface ResultadoExtraccionCbc {
  alquileres: AlquilerMensual[];
  unmapped: string[];
}

/**
 * Parsea un CBC (.xlsm en buffer). `mapping` reemplaza la lectura de
 * config/locales_mapping.json del sistema Python (acá viene de alqLocalesMapping,
 * inyectado por el llamador en vez de leído de un archivo).
 */
export async function extraerAlquileres(
  buffer: ExcelJS.Buffer | Buffer,
  mapping: Record<string, string>,
  nombreArchivo = ""
): Promise<ResultadoExtraccionCbc> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ExcelJS.Buffer);

  const sheet = wb.getWorksheet(HOJA);
  if (!sheet) {
    throw new Error(
      `Hoja '${HOJA}' no encontrada en ${nombreArchivo}. Disponibles: ${wb.worksheets
        .map((w) => w.name)
        .join(", ")}`
    );
  }

  const resultados: AlquilerMensual[] = [];
  const unmapped = new Set<string>();

  let proveedorActual: string | null = null;
  let mesActual: string | null = null;
  let esAlquiler = false;
  let facturas: Factura[] = [];
  let pagos: Pago[] = [];

  const emit = () => {
    if (esAlquiler && proveedorActual) {
      resultados.push(
        construirAlquiler(proveedorActual, mesActual ?? "", mapping, unmapped, facturas, pagos)
      );
    }
  };

  // sheet.actualRowCount subcuenta en 1 en archivos reales (verificado contra el
  // fixture CBC) — usar rowCount, que refleja la dimensión declarada de la hoja.
  const maxRow = sheet.rowCount;
  for (let i = 1; i <= maxRow; i++) {
    const row = sheet.getRow(i);
    const tipoFila = textoOr(row.getCell(COL_TIPO_FILA).value);
    const tipoReg = textoOr(row.getCell(COL_TIPO_REG).value);
    const cuenta = textoOr(row.getCell(COL_CUENTA).value);
    const tipoMov = textoOr(row.getCell(COL_TIPO_MOV).value);

    // ── Inicio de bloque mes×proveedor ─────────────────────────────────────
    if (tipoFila === "D" && cuenta && cuenta.toLowerCase().includes("alquil")) {
      emit();
      proveedorActual = textoOr(row.getCell(COL_PROVEEDOR).value);
      mesActual = textoOr(row.getCell(COL_MES_HDR).value);
      esAlquiler = true;
      facturas = [];
      pagos = [];
      continue;
    }

    // ── Cierre de bloque ────────────────────────────────────────────────────
    if (tipoFila === "H") {
      emit();
      esAlquiler = false;
      proveedorActual = null;
      continue;
    }

    if (!esAlquiler) continue;

    // ── Filas de detalle: solo 'I' o 'IE' ───────────────────────────────────
    if (tipoReg !== "I" && tipoReg !== "IE") continue;

    // Compra (incluye Comp/Pago que registra la deuda)
    if (tipoMov === "Compra" || tipoMov === "Comp/Pago") {
      const montoRaw = numeroOr0(row.getCell(COL_TOTAL_COMPRA).value);
      if (montoRaw !== 0) {
        facturas.push({
          fecha: fechaEstrictaIso(row.getCell(COL_FECHA_MOV).value),
          razonSocial: textoOr(row.getCell(COL_RAZON_SOC).value),
          cuit: textoOr(row.getCell(COL_CUIT).value),
          monto: Math.abs(montoRaw),
          tipoComprobante: Math.trunc(numeroOr0(row.getCell(COL_TIPO_CBTE).value)),
        });
      }
    }

    // Pago (incluye Comp/Pago si también tiene monto en col pago). Se incluyen
    // montos negativos (reversales/anulaciones) para que el neto coincida
    // exactamente con la fila de totales del propio CBC.
    if (tipoMov === "Pago" || tipoMov === "Comp/Pago") {
      const montoPago = numeroOr0(row.getCell(COL_MONTO_PAGO).value);
      if (montoPago !== 0) {
        pagos.push({
          fecha: fechaEstrictaIso(row.getCell(COL_FECHA_MOV).value),
          monto: montoPago,
          medio: "efectivo",
          nroCheque: textoOr(row.getCell(COL_NRO_CHEQUE).value),
        });
      }
    }
  }

  // Cerrar bloque que no tuvo 'H' al final (defensivo)
  emit();

  return { alquileres: resultados, unmapped: [...unmapped] };
}

function construirAlquiler(
  proveedor: string,
  mes: string,
  mapping: Record<string, string>,
  unmapped: Set<string>,
  facturas: Factura[],
  pagos: Pago[]
): AlquilerMensual {
  let local = mapping[proveedor];
  if (local === undefined) {
    unmapped.add(proveedor);
    local = `_DESCONOCIDO_${proveedor}`;
  }

  const totalFacturado = facturas.reduce((acc, f) => acc + f.monto, 0);
  const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0); // puede incluir negativos (reversales)

  // Fecha del último pago real (positivo) — los reversales no cuentan como "fecha de pago".
  const fechasPagoValidas = pagos
    .filter((p): p is Pago & { fecha: string } => p.fecha !== null && p.monto > 0)
    .map((p) => p.fecha);
  const fechaUltimoPago =
    fechasPagoValidas.length > 0
      ? fechasPagoValidas.reduce((max, f) => (f > max ? f : max))
      : null;

  return {
    local,
    proveedorCbc: proveedor,
    mes,
    totalFacturado,
    totalPagado,
    saldo: totalFacturado - totalPagado,
    fechaUltimoPago,
    facturas: [...facturas],
    pagos: [...pagos],
  };
}
