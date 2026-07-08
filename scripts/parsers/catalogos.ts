import ExcelJS from "exceljs";
import { leerCeldaTexto, normalizar } from "./excel-utils";

export interface TitularRow {
  archivoOrigen: string;
  cod: number;
  nombre: string;
  grupo1: string | null;
  grupo2: string | null;
  grupo3: string | null;
  razonSocial: string | null;
  cuit: string | null;
  telefono: string | null;
}

export interface CuentaRow {
  cod: number;
  grupo: string | null;
  rubro: string | null;
  subrubro: string | null;
  cuenta: string;
}

/**
 * Lee la hoja "Titulares". El catálogo real tiene columnas GRUPO 1/2/3, NOMBRE TITULAR,
 * COD. (y en OBRAS.xlsx además RAZON SOCIAL, CUIT, TEL-INFO). La fila de headers y el
 * rango de datos varían entre archivos (2026: filas ~19-500; OBRAS: filas ~16-90), por
 * eso se ubica dinámicamente en vez de hardcodear el rango.
 */
export function leerTitulares(workbook: ExcelJS.Workbook, archivoOrigen: string): TitularRow[] {
  const sheet = workbook.getWorksheet("Titulares");
  if (!sheet) throw new Error(`No se encontró la hoja "Titulares" en ${archivoOrigen}`);

  const filaHeaders = ubicarFilaHeadersTitulares(sheet);
  const columnas = mapearColumnasPorTexto(sheet, filaHeaders, {
    grupo1: ["GRUPO 1"],
    grupo2: ["GRUPO 2"],
    grupo3: ["GRUPO 3"],
    nombre: ["NOMBRE TITULAR"],
    cod: ["COD.", "COD"],
    razonSocial: ["RAZON SOCIAL"],
    cuit: ["CUIT"],
    telefono: ["TEL-INFO", "TELEFONO"],
  });

  if (columnas.nombre === undefined || columnas.cod === undefined) {
    throw new Error(
      `No se pudieron ubicar las columnas NOMBRE TITULAR / COD. en la hoja Titulares de ${archivoOrigen}`
    );
  }

  const resultado: TitularRow[] = [];
  const maxRow = sheet.actualRowCount || sheet.rowCount;

  for (let fila = filaHeaders + 1; fila <= maxRow; fila++) {
    const row = sheet.getRow(fila);
    const nombre = leerCeldaTexto(row.getCell(columnas.nombre));
    const codTexto = leerCeldaTexto(row.getCell(columnas.cod));
    if (!nombre || !codTexto) continue;

    const cod = Number(codTexto);
    if (!Number.isInteger(cod)) continue; // descarta placeholders tipo "zzNoEliminar" (cod hasta 100000 no numérico, o vacío)

    resultado.push({
      archivoOrigen,
      cod,
      nombre,
      grupo1: columnas.grupo1 ? leerCeldaTexto(row.getCell(columnas.grupo1)) : null,
      grupo2: columnas.grupo2 ? leerCeldaTexto(row.getCell(columnas.grupo2)) : null,
      grupo3: columnas.grupo3 ? leerCeldaTexto(row.getCell(columnas.grupo3)) : null,
      razonSocial: columnas.razonSocial ? leerCeldaTexto(row.getCell(columnas.razonSocial)) : null,
      cuit: columnas.cuit ? leerCeldaTexto(row.getCell(columnas.cuit)) : null,
      telefono: columnas.telefono ? leerCeldaTexto(row.getCell(columnas.telefono)) : null,
    });
  }

  return dedupePorCod(resultado);
}

/**
 * Lee la hoja "Plan de Cuentas" (idéntica en ambos archivos): jerarquía
 * GRUPO -> RUBRO -> SUB-RUBRO -> CUENTA, con un código numérico propio por cuenta.
 */
export function leerPlanCuentas(workbook: ExcelJS.Workbook): CuentaRow[] {
  const sheet = workbook.getWorksheet("Plan de Cuentas");
  if (!sheet) throw new Error(`No se encontró la hoja "Plan de Cuentas"`);

  const filaHeaders = ubicarFilaHeadersPlanCuentas(sheet);
  const columnas = mapearColumnasPorTexto(sheet, filaHeaders, {
    grupo: ["GRUPO"],
    rubro: ["RUBRO"],
    subrubro: ["SUB-RUBRO", "SUBRUBRO"],
    cuenta: ["CUENTA"],
  });

  if (columnas.cuenta === undefined) {
    throw new Error(`No se pudo ubicar la columna CUENTA en la hoja Plan de Cuentas`);
  }

  // El código numérico real (usado en los VLOOKUP de las hojas de obra) es la
  // SEGUNDA columna "COD" de la fila de headers, ubicada a la derecha de CUENTA.
  const codCol = ubicarSegundaColumnaCod(sheet, filaHeaders, columnas.cuenta);
  if (codCol === undefined) {
    throw new Error(`No se pudo ubicar la columna de código numérico en Plan de Cuentas`);
  }

  const resultado: CuentaRow[] = [];
  const maxRow = sheet.actualRowCount || sheet.rowCount;

  for (let fila = filaHeaders + 1; fila <= maxRow; fila++) {
    const row = sheet.getRow(fila);
    const cuenta = leerCeldaTexto(row.getCell(columnas.cuenta));
    const codTexto = leerCeldaTexto(row.getCell(codCol));
    if (!cuenta || !codTexto) continue;

    const cod = Number(codTexto);
    if (!Number.isInteger(cod)) continue;

    resultado.push({
      cod,
      grupo: columnas.grupo ? leerCeldaTexto(row.getCell(columnas.grupo)) : null,
      rubro: columnas.rubro ? leerCeldaTexto(row.getCell(columnas.rubro)) : null,
      subrubro: columnas.subrubro ? leerCeldaTexto(row.getCell(columnas.subrubro)) : null,
      cuenta,
    });
  }

  return dedupePorCod(resultado);
}

// --- Helpers internos ---

function mapearColumnasPorTexto(
  sheet: ExcelJS.Worksheet,
  filaHeaders: number,
  specs: Record<string, string[]>
): Partial<Record<string, number>> {
  const celdas: { texto: string; col: number }[] = [];
  sheet.getRow(filaHeaders).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (typeof cell.value === "string" && cell.value.trim() !== "") {
      celdas.push({ texto: normalizar(cell.value), col: colNumber });
    }
  });

  const columnas: Partial<Record<string, number>> = {};
  for (const [clave, variantes] of Object.entries(specs)) {
    const variantesNorm = variantes.map(normalizar);
    const match = celdas.find((c) => variantesNorm.includes(c.texto));
    if (match) columnas[clave] = match.col;
  }
  return columnas;
}

function ubicarFilaHeadersTitulares(sheet: ExcelJS.Worksheet): number {
  for (let fila = 1; fila <= 25; fila++) {
    let encontrado = false;
    sheet.getRow(fila).eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string" && normalizar(cell.value) === "NOMBRE TITULAR") {
        encontrado = true;
      }
    });
    if (encontrado) return fila;
  }
  throw new Error('No se encontró la fila de headers ("NOMBRE TITULAR") en la hoja Titulares');
}

function ubicarFilaHeadersPlanCuentas(sheet: ExcelJS.Worksheet): number {
  for (let fila = 1; fila <= 10; fila++) {
    let encontrado = false;
    sheet.getRow(fila).eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string" && normalizar(cell.value) === "CUENTA") {
        encontrado = true;
      }
    });
    if (encontrado) return fila;
  }
  throw new Error('No se encontró la fila de headers ("CUENTA") en la hoja Plan de Cuentas');
}

/** Busca la primera columna con header "COD" ubicada a la derecha de la columna CUENTA. */
function ubicarSegundaColumnaCod(
  sheet: ExcelJS.Worksheet,
  filaHeaders: number,
  columnaCuenta: number
): number | undefined {
  let resultado: number | undefined;
  sheet.getRow(filaHeaders).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (
      colNumber > columnaCuenta &&
      typeof cell.value === "string" &&
      normalizar(cell.value).startsWith("COD") &&
      resultado === undefined
    ) {
      resultado = colNumber;
    }
  });
  return resultado;
}

function dedupePorCod<T extends { cod: number }>(rows: T[]): T[] {
  const vistos = new Map<number, T>();
  for (const row of rows) vistos.set(row.cod, row); // última ocurrencia gana
  return [...vistos.values()];
}
