/**
 * Uso único: al agregar cp_listas_precios_importaciones/historial (ver
 * db/schema.ts), la lista vigente de cada proveedor en cp_listas_precios_proveedor
 * ya estaba cargada de antes y nunca generó su snapshot histórico — sin este
 * backfill, la primera vez que se reimporte una lista después de este cambio
 * quedaría como la ÚNICA importación registrada y obtenerDeltaListaMismoProveedor()
 * no tendría con qué compararla. Corre una sola vez, antes de la primera
 * reimportación posterior a este cambio (ej. antes de cargar "NUEVA COPIA 12
 * 27-7.xls" de El Criollo, para poder compararla contra la "20-7" ya cargada).
 *
 * Usa importado_en = MIN(importado_en) de las filas vigentes de ese proveedor,
 * para que la fecha mostrada como "anterior" sea la fecha real de esa carga, no
 * la fecha de hoy en que se corre este backfill.
 *
 * Uso: npx tsx scripts/backfill-historial-listas-precios.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { cpListasPreciosHistorial, cpListasPreciosImportaciones, cpListasPreciosProveedor, cpProveedores } from "../db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const proveedores = await db.select().from(cpProveedores);

  for (const proveedor of proveedores) {
    const filas = await db
      .select()
      .from(cpListasPreciosProveedor)
      .where(eq(cpListasPreciosProveedor.proveedorId, proveedor.id));
    if (filas.length === 0) continue;

    const yaTieneHistorial = await db
      .select({ id: cpListasPreciosImportaciones.id })
      .from(cpListasPreciosImportaciones)
      .where(eq(cpListasPreciosImportaciones.proveedorId, proveedor.id))
      .limit(1);
    if (yaTieneHistorial.length > 0) {
      console.log(`${proveedor.nombre}: ya tiene historial, se omite (no se duplica).`);
      continue;
    }

    const archivoOrigen = filas[0].archivoOrigen;
    const fechaMin = filas.reduce((min, f) => (f.importadoEn < min ? f.importadoEn : min), filas[0].importadoEn);

    const [importacion] = await db
      .insert(cpListasPreciosImportaciones)
      .values({ proveedorId: proveedor.id, archivoOrigen, importadoEn: fechaMin })
      .returning({ id: cpListasPreciosImportaciones.id });

    await db.insert(cpListasPreciosHistorial).values(
      filas.map((f) => ({
        importacionId: importacion.id,
        codigoProveedor: f.codigoProveedor,
        descripcion: f.descripcion,
        categoria: f.categoria,
        precioLista: f.precioLista,
        precioConBonificacion: f.precioConBonificacion,
        productoId: f.productoId,
      }))
    );

    console.log(`${proveedor.nombre}: backfill de ${filas.length} filas desde "${archivoOrigen}" (${fechaMin.toISOString()}).`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
