import ExcelJS from "exceljs";

export const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

export interface HeaderSpec {
  /** clave interna usada para leer la columna, ej. "fecha", "monto" */
  clave: string;
  /** variantes de texto de header aceptadas (case/acento-insensitive) */
  variantes: string[];
  /** si es false, la columna es opcional y puede no encontrarse */
  requerido?: boolean;
}

export interface HeadersUbicados {
  filaHeaders: number;
  columnas: Partial<Record<string, number>>;
}

/**
 * Busca en las primeras `filaMax` filas de la hoja aquella que contenga todos los
 * headers marcados como `requerido`. Las hojas de caja reales tienen la fila de
 * headers en la posición 3 o 4 según el archivo, por eso no se puede hardcodear.
 */
export function ubicarHeaders(
  sheet: ExcelJS.Worksheet,
  specs: HeaderSpec[],
  filaMax = 10
): HeadersUbicados {
  const obligatorias = specs.filter((s) => s.requerido !== false);

  for (let fila = 1; fila <= filaMax; fila++) {
    const celdasTexto: { texto: string; col: number }[] = [];
    sheet.getRow(fila).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (typeof cell.value === "string" && cell.value.trim() !== "") {
        celdasTexto.push({ texto: normalizar(cell.value), col: colNumber });
      }
    });
    if (celdasTexto.length === 0) continue;

    const columnas: Partial<Record<string, number>> = {};
    for (const spec of specs) {
      const variantesNorm = spec.variantes.map(normalizar);
      const match = celdasTexto.find((c) => variantesNorm.includes(c.texto));
      if (match) columnas[spec.clave] = match.col;
    }

    const encontroTodasLasObligatorias = obligatorias.every(
      (s) => columnas[s.clave] !== undefined
    );
    if (encontroTodasLasObligatorias) {
      return { filaHeaders: fila, columnas };
    }
  }

  throw new Error(
    `No se encontraron los headers obligatorios (${obligatorias
      .map((s) => s.clave)
      .join(", ")}) en las primeras ${filaMax} filas de la hoja "${sheet.name}"`
  );
}

export interface ValorCelda {
  valor: number | null;
  formula: string | null;
}

/**
 * Detecta valores "tipo fórmula" de ExcelJS. Las celdas que continúan un rango de
 * fórmula compartida (ej. el resto de la columna TOTAL $ después de la primera fila)
 * NO tienen la clave `formula` (solo `sharedFormula` + `result`) — hay que aceptar
 * cualquiera de las tres claves, no solo `formula`, para no perder esas celdas.
 */
function esValorFormula(
  v: unknown
): v is { formula?: string; sharedFormula?: string; result?: ExcelJS.CellValue } {
  return (
    v !== null &&
    typeof v === "object" &&
    !(v instanceof Date) &&
    ("formula" in v || "sharedFormula" in v || "result" in v)
  );
}

/** Lee una celda numérica devolviendo tanto el valor calculado como la fórmula cruda (si la hay). */
export function leerCeldaNumerica(cell: ExcelJS.Cell): ValorCelda {
  const v = cell.value;
  if (esValorFormula(v)) {
    const resultado = v.result;
    let valor: number | null = null;
    if (typeof resultado === "number") {
      valor = resultado;
    } else if (typeof resultado === "string") {
      const parsed = Number(resultado);
      valor = Number.isFinite(parsed) ? parsed : null;
    }
    const formula = typeof v.formula === "string" ? `=${v.formula}` : null;
    return { valor, formula };
  }
  if (typeof v === "number") return { valor: v, formula: null };
  return { valor: null, formula: null };
}

/** Devuelve el texto plano de una celda, resolviendo el resultado cacheado si es fórmula. */
export function leerCeldaTexto(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (esValorFormula(v)) {
    const resultado = v.result;
    if (typeof resultado === "string") return resultado.trim() || null;
    if (typeof resultado === "number") return String(resultado);
    if (resultado && typeof resultado === "object" && "error" in resultado) return null;
    return null;
  }
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim() || null;
  }
  return null;
}

const MESES_ES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/**
 * Algunas filas tienen la fecha tipeada como texto en vez de fecha de Excel
 * (ej. "viernes, 29 de mayo de 2026"), en vez del tipo Date nativo. Se intenta
 * reconocer ese formato como respaldo para no perder la fila.
 */
function parsearFechaTextoEspanol(texto: string): Date | null {
  const match = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = MESES_ES[match[2]];
  const anio = Number(match[3]);
  if (mes === undefined || !Number.isInteger(dia) || !Number.isInteger(anio)) return null;
  return new Date(Date.UTC(anio, mes, dia));
}

/** Devuelve la fecha de una celda: Date nativo de Excel, o texto en español como respaldo. */
export function leerCeldaFecha(cell: ExcelJS.Cell): Date | null {
  const v = cell.value;
  if (v instanceof Date) return v;
  if (typeof v === "string") return parsearFechaTextoEspanol(v);
  return null;
}

/** Convierte un Date de ExcelJS (interpretado en UTC) a "YYYY-MM-DD" sin corrimiento de zona horaria. */
export function fechaAISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Color de fondo (ARGB) de una celda, si tiene relleno sólido. */
export function leerColorFondo(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill;
  if (fill && fill.type === "pattern" && fill.pattern === "solid") {
    const fg = fill.fgColor;
    if (fg?.argb) return fg.argb;
  }
  return null;
}

/** true si el texto de la celda de fecha/columna A indica una fila de totales ("TOTALES", "TOTA" truncado, etc). */
export function esTextoDeTotales(texto: string | null): boolean {
  if (!texto) return false;
  const t = normalizar(texto);
  return t.startsWith("TOTA");
}
