import ExcelJS from "exceljs";
import { textoOr, numeroOr0, fechaEstrictaIso, valorPlano } from "./excel-helpers";
import type { Contrato } from "./tipos";

/**
 * Porta contratoAlquileres/src/contracts.py — lee el Excel maestro de contratos y
 * devuelve un Contrato por local. El nombre canónico del local se extrae del
 * título en la primera fila de cada hoja (columna A), no del nombre de la pestaña
 * (ej: hoja "CASA LUCCA" → local "ENCISO").
 *
 * A diferencia de cbc-parser.ts, las columnas de contracts.py (_COLS) ya son
 * 1-indexadas en el original (id=1→A, estado=2→B, ..., fecha=6→F, ...) — se
 * mapean directo a ExcelJS sin sumar 1.
 */

const HOJAS_SKIP = new Set([
  "CANON_VIGENTE",
  "DASHBOARD",
  "CONFIG",
  "RESUMEN",
  "SEGUIMIENTO_PAGOS",
  "CONTRATOS_VIGENTES",
]);
const FILA_DATOS_INICIO = 4;

const COLS = {
  id: 1,
  estado: 2,
  tipo: 3,
  domicilio: 4,
  partes: 5,
  fecha: 6,
  vencimiento: 7,
  plazo: 8,
  valor: 9,
  actualizacion: 10,
  prorroga: 11,
  voluntad: 12,
  renegociacion: 13,
} as const;

const ESTADOS: Record<string, string> = {
  vigente: "Vigente",
  "histórico": "Histórico",
  historico: "Histórico",
  adenda: "Adenda",
  pendiente: "Pendiente",
};

/** "ENCISO — Fernández de Enciso 3909/29" → "ENCISO" */
function extraerLocal(value: ExcelJS.CellValue): string {
  const v = valorPlano(value);
  if (!v) return "";
  return String(v).split(/\s[—–-]\s/)[0].trim();
}

function normalizaEstado(value: ExcelJS.CellValue): string | null {
  const v = valorPlano(value);
  if (!v) return null;
  return ESTADOS[String(v).trim().toLowerCase()] ?? null;
}

/**
 * Devuelve {nombre_local: [Contrato, ...]} para todas las hojas de locales.
 * Solo incluye filas con ESTADO reconocido. Si el título de la hoja no resuelve
 * un local (fila 1 vacía/no reconocida), la hoja entera se descarta del resultado
 * — mismo comportamiento (algo sutil) que el `if local and contratos` original.
 */
export async function cargarMaestro(
  buffer: ExcelJS.Buffer | Buffer
): Promise<Record<string, Contrato[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ExcelJS.Buffer);

  const resultado: Record<string, Contrato[]> = {};

  for (const sheet of wb.worksheets) {
    if (HOJAS_SKIP.has(sheet.name)) continue;

    let local = "";
    const contratos: Contrato[] = [];
    // sheet.actualRowCount subcuenta en 1 en este archivo (verificado contra el
    // fixture real) — usar rowCount, que refleja la dimensión declarada de la hoja.
    const maxRow = sheet.rowCount;

    for (let i = 1; i <= maxRow; i++) {
      const row = sheet.getRow(i);

      if (i === 1) {
        local = extraerLocal(row.getCell(1).value);
        continue;
      }
      if (i < FILA_DATOS_INICIO) continue;

      const estado = normalizaEstado(row.getCell(COLS.estado).value);
      if (estado === null) continue;

      contratos.push({
        local: local || sheet.name,
        id: Math.trunc(numeroOr0(row.getCell(COLS.id).value)),
        estado,
        tipo: textoOr(row.getCell(COLS.tipo).value),
        domicilio: textoOr(row.getCell(COLS.domicilio).value),
        partes: textoOr(row.getCell(COLS.partes).value),
        fechaContrato: fechaEstrictaIso(row.getCell(COLS.fecha).value),
        vencimiento: fechaEstrictaIso(row.getCell(COLS.vencimiento).value),
        plazo: textoOr(row.getCell(COLS.plazo).value),
        valorMoneda: textoOr(row.getCell(COLS.valor).value),
        actualizacion: textoOr(row.getCell(COLS.actualizacion).value),
        prorroga: textoOr(row.getCell(COLS.prorroga).value),
        voluntad: textoOr(row.getCell(COLS.voluntad).value),
        renegociacion: textoOr(row.getCell(COLS.renegociacion).value),
      });
    }

    if (local && contratos.length > 0) {
      resultado[local] = contratos;
    }
  }

  return resultado;
}
