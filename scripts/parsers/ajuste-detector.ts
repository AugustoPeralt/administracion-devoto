/**
 * Detecta "ajustes ocultos": celdas de monto donde el usuario escribió una fórmula
 * de aritmética con números literales (ej. "=-15399000+452000") en vez de un valor fijo,
 * o en vez de una fórmula estructural que referencia otras celdas (ej. "=+E5+G4").
 *
 * Caso real que originó esta regla: fila "SUELDOS OPERATIVOS" en CONSOLIDADO 2026.xlsx,
 * columna de monto con la fórmula literal "=-15399000+452000" (dos conceptos sumados
 * en la misma celda, ocultando el origen de cada número).
 */

// Requiere al menos dos números literales combinados con +, -, * o / (excluye
// referencias a celdas como "E5", funciones como "SUM(...)" y valores simples sin combinar).
const FORMULA_ARITMETICA_LITERAL =
  /^=\s*-?\d+(?:\.\d+)?\s*(?:[+\-*/]\s*-?\d+(?:\.\d+)?\s*)+$/;

export function esFormulaDeAjusteManual(formula: string | null | undefined): boolean {
  if (!formula) return false;
  return FORMULA_ARITMETICA_LITERAL.test(formula.trim());
}
