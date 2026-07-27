"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { cpPreciosReferenciaVerduleria } from "@/db/schema";
import { normalizarNombreProducto } from "@/lib/control-precios/normalizar";
import { sql as drizzleSql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

// Columna B = nombre del producto, C = unidad de medida, D en adelante = precio
// mensual ("Julio 2026", "Agosto 2026", ...) — layout confirmado del archivo real
// facturaBpedidosJulio-diciembre 2026.xlsx de contabilidad (5cynar).
const COLUMNA_PRODUCTO = 2;
const COLUMNA_UNIDAD = 3;
const PRIMERA_COLUMNA_MES = 4;

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

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "Julio 2026" / "JUL-2026" / "julio de 2026" -> "2026-07-01". null si no matchea. */
function parsearHeaderMes(header: string): string | null {
  const match = normalizarTexto(header).match(/([a-z]+)\D*(\d{4})/);
  if (!match) return null;
  const mes = MESES_ES[match[1]];
  const anio = Number(match[2]);
  if (mes === undefined || !Number.isInteger(anio)) return null;
  return `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
}

function leerCeldaTexto(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim() || null;
  }
  return null;
}

/** Los precios vienen como número nativo de Excel en el 99% de los casos; el
 * fallback de texto asume separador de miles "." y decimal "," (formato AR), por si
 * alguna celda quedó tipeada como texto en vez de número. */
function leerCeldaPrecio(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const limpio = v.trim().replace(/\./g, "").replace(",", ".");
    const n = Number(limpio);
    return Number.isFinite(n) && limpio !== "" ? n : null;
  }
  if (v !== null && typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    if (typeof r === "number") return r;
  }
  return null;
}

/**
 * Parsea facturaBpedidosJulio-diciembre 2026.xlsx (o el que sea el archivo vigente
 * de 5cynar) y hace upsert en cp_precios_referencia_verduleria por (nombre
 * normalizado, período). Reimportar el mismo archivo actualizado no duplica filas.
 */
export async function importarPrecios5cynar(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("No autorizado.");

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) throw new Error("Falta el archivo Excel.");
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("El archivo debe ser un .xlsx.");
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  // exceljs/index.d.ts declara `interface Buffer extends ArrayBuffer {}` a nivel
  // global, lo que fusiona con el Buffer de Node y vuelve el tipo Buffer literalmente
  // no-satisfacible con @types/node 26 (exige props de ArrayBuffer redimensionable
  // que ningún Buffer real tiene) — bug de tipos de la librería, no del valor en
  // runtime. `as unknown as Buffer` no alcanza porque el tipo roto se re-chequea en
  // el propio call site; `any` es el escape hatch correcto acá. El resto del repo no
  // lo pisa porque siempre usa xlsx.readFile(path), nunca xlsx.load(buffer) en memoria.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("El archivo Excel no tiene hojas.");

  const columnasMes: { col: number; periodo: string }[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber < PRIMERA_COLUMNA_MES) return;
    const texto = leerCeldaTexto(cell);
    if (!texto) return;
    const periodo = parsearHeaderMes(texto);
    if (periodo) columnasMes.push({ col: colNumber, periodo });
  });

  if (columnasMes.length === 0) {
    throw new Error(
      'No se encontraron columnas de mes reconocibles en la fila 1 (formato esperado: "Julio 2026", "Agosto 2026", ...).'
    );
  }

  let filasLeidas = 0;
  let preciosImportados = 0;
  const filasSinDatos: number[] = [];

  for (let filaNum = 2; filaNum <= sheet.rowCount; filaNum++) {
    const fila = sheet.getRow(filaNum);
    const nombreProducto = leerCeldaTexto(fila.getCell(COLUMNA_PRODUCTO));
    if (!nombreProducto) continue; // fila vacía, se salta sin error

    filasLeidas++;
    const unidadMedida = leerCeldaTexto(fila.getCell(COLUMNA_UNIDAD)) ?? "u";
    const nombreNormalizado = normalizarNombreProducto(nombreProducto);

    let algunPrecioEnEstaFila = false;
    for (const { col, periodo } of columnasMes) {
      const precio = leerCeldaPrecio(fila.getCell(col));
      if (precio === null) continue; // ese mes todavía no tiene precio cargado, no es error

      await db
        .insert(cpPreciosReferenciaVerduleria)
        .values({
          productoNombreNormalizado: nombreNormalizado,
          productoNombre: nombreProducto,
          unidadMedida,
          periodo,
          precioUnitario: precio.toFixed(2),
          archivoOrigen: archivo.name,
        })
        .onConflictDoUpdate({
          target: [cpPreciosReferenciaVerduleria.productoNombreNormalizado, cpPreciosReferenciaVerduleria.periodo],
          set: {
            productoNombre: drizzleSql`excluded.producto_nombre`,
            unidadMedida: drizzleSql`excluded.unidad_medida`,
            precioUnitario: drizzleSql`excluded.precio_unitario`,
            archivoOrigen: drizzleSql`excluded.archivo_origen`,
            importadoEn: new Date(),
          },
        });
      preciosImportados++;
      algunPrecioEnEstaFila = true;
    }
    if (!algunPrecioEnEstaFila) filasSinDatos.push(filaNum);
  }

  revalidatePath("/control-precios/verduleria");

  return {
    archivo: archivo.name,
    mesesDetectados: columnasMes.map((m) => m.periodo),
    filasLeidas,
    preciosImportados,
    filasSinDatos, // filas con nombre de producto pero sin ningún precio en ningún mes — para avisar en la UI, no bloquea la importación
  };
}
