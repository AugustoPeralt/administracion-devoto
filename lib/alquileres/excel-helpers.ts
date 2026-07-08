import type { CellValue, CellRichTextValue } from "exceljs";

/**
 * Ídem que openpyxl con data_only=True: resuelve fórmulas a su resultado cacheado
 * y texto enriquecido (richText) a texto plano. Nunca devuelve el objeto crudo de
 * ExcelJS — usado como base de todos los helpers de este módulo para que el
 * comportamiento sea el mismo sin importar si la celda es un literal o una fórmula.
 */
export function valorPlano(value: CellValue): unknown {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    // Fórmula (master o "slave" de un rango compartido): si Excel no cacheó un
    // <v> para esta celda (p.ej. fórmulas anidadas que resuelven a "" en algunas
    // filas), no hay clave "result" — tratarlo como vacío, igual que openpyxl
    // con data_only=True (que también devuelve None en ese caso), en vez de
    // devolver el objeto {formula/sharedFormula} crudo.
    if ("formula" in value || "sharedFormula" in value) {
      return "result" in value ? valorPlano((value as { result: CellValue }).result) : null;
    }
    if ("error" in value) return null;
    if ("richText" in value) {
      return (value as CellRichTextValue).richText.map((r) => r.text).join("");
    }
  }
  return value;
}

/** Mirror de Python `str(x or "")`: cualquier valor falsy (None, 0, "", False) → "". */
export function textoOr(value: CellValue): string {
  const v = valorPlano(value);
  return v ? String(v) : "";
}

/** Mirror de Python `float(x or 0)`, tolerante a strings numéricos. */
export function numeroOr0(value: CellValue): number {
  const v = valorPlano(value);
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Convierte un Date (interpretado en UTC) a "YYYY-MM-DD" sin corrimiento de zona horaria. */
export function fechaAISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Mirror de `_to_date` en contracts.py: SOLO un Date real (o resultado de fórmula
 * que sea Date) pasa. A diferencia de scripts/parsers/excel-utils.ts, NO intenta
 * parsear fechas en texto español — contracts.py tampoco lo hace, y replicar ese
 * fallback rompería la paridad con filas que traen texto tipo "N/A".
 */
export function fechaEstrictaIso(value: CellValue): string | null {
  const v = valorPlano(value);
  return v instanceof Date ? fechaAISO(v) : null;
}
