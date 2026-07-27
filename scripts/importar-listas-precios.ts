/**
 * Importa las listas de precios de El Criollo y El Emporio desde archivos
 * locales — mismo camino que el formulario de /control-precios/comparacion,
 * pero para correr desde la terminal (ej. carga inicial, o reimportar sin
 * pasar por el navegador). Reimportar el mismo proveedor reemplaza su lista
 * vigente (upsert por código, se borran los códigos que ya no vienen) — pero
 * además cada import queda guardado aparte, sin pisarse, en
 * cp_listas_precios_importaciones/historial, para poder comparar la lista
 * anterior contra la nueva del mismo proveedor (ver
 * obtenerDeltaListaMismoProveedor() en lib/control-precios/consultas.ts).
 *
 * Uso:
 *   npx tsx scripts/importar-listas-precios.ts criollo "NUEVA COPIA 12 20-7.xls"
 *   npx tsx scripts/importar-listas-precios.ts emporio "LISTA 23-7.xlsx"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import {
  cpListasPreciosHistorial,
  cpListasPreciosImportaciones,
  cpListasPreciosProveedor,
  cpProductos,
} from "../db/schema";
import { NOMBRE_PROVEEDOR_EL_CRIOLLO } from "../lib/control-precios/constantes";
import { NOMBRE_PROVEEDOR_EL_EMPORIO, buscarProveedorIdPorNombre } from "../lib/control-precios/consultas";
import { normalizarNombreProducto } from "../lib/control-precios/normalizar";
import { parsearListaElCriollo, parsearListaElEmporio, type FilaListaPrecio } from "../lib/control-precios/listas-precios";
import { and, eq, notInArray } from "drizzle-orm";
import { readFileSync } from "fs";
import path from "path";

async function importarLista(proveedorId: number, archivoOrigen: string, filas: FilaListaPrecio[]) {
  const productosProveedor = await db
    .select({ id: cpProductos.id, nombre: cpProductos.nombre })
    .from(cpProductos)
    .where(eq(cpProductos.proveedorId, proveedorId));
  const idPorNombre = new Map(productosProveedor.map((p) => [normalizarNombreProducto(p.nombre), p.id]));

  let vinculados = 0;
  for (const fila of filas) {
    const productoId = idPorNombre.get(normalizarNombreProducto(fila.descripcion)) ?? null;
    if (productoId !== null) vinculados++;

    await db
      .insert(cpListasPreciosProveedor)
      .values({
        proveedorId,
        codigoProveedor: fila.codigoProveedor,
        descripcion: fila.descripcion,
        presentacion: fila.presentacion,
        categoria: fila.categoria,
        precioLista: fila.precioLista.toFixed(2),
        precioConBonificacion: fila.precioConBonificacion !== null ? fila.precioConBonificacion.toFixed(2) : null,
        productoId,
        archivoOrigen,
      })
      .onConflictDoUpdate({
        target: [cpListasPreciosProveedor.proveedorId, cpListasPreciosProveedor.codigoProveedor],
        set: {
          descripcion: fila.descripcion,
          presentacion: fila.presentacion,
          categoria: fila.categoria,
          precioLista: fila.precioLista.toFixed(2),
          precioConBonificacion: fila.precioConBonificacion !== null ? fila.precioConBonificacion.toFixed(2) : null,
          productoId,
          archivoOrigen,
          importadoEn: new Date(),
        },
      });
  }

  const codigosNuevos = filas.map((f) => f.codigoProveedor);
  await db
    .delete(cpListasPreciosProveedor)
    .where(
      and(
        eq(cpListasPreciosProveedor.proveedorId, proveedorId),
        notInArray(cpListasPreciosProveedor.codigoProveedor, codigosNuevos)
      )
    );

  const [importacion] = await db
    .insert(cpListasPreciosImportaciones)
    .values({ proveedorId, archivoOrigen })
    .returning({ id: cpListasPreciosImportaciones.id });
  await db.insert(cpListasPreciosHistorial).values(
    filas.map((fila) => ({
      importacionId: importacion.id,
      codigoProveedor: fila.codigoProveedor,
      descripcion: fila.descripcion,
      categoria: fila.categoria,
      precioLista: fila.precioLista.toFixed(2),
      precioConBonificacion: fila.precioConBonificacion !== null ? fila.precioConBonificacion.toFixed(2) : null,
      productoId: idPorNombre.get(normalizarNombreProducto(fila.descripcion)) ?? null,
    }))
  );

  return { filasImportadas: filas.length, vinculados };
}

async function main() {
  const [proveedorArg, archivoArg] = process.argv.slice(2);
  if (!proveedorArg || !archivoArg) {
    console.error('Uso: npx tsx scripts/importar-listas-precios.ts <criollo|emporio> "<archivo>"');
    process.exit(1);
  }

  const buffer = readFileSync(path.resolve(archivoArg));

  if (proveedorArg === "criollo") {
    const filas = parsearListaElCriollo(buffer);
    const proveedorId = await buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO);
    const res = await importarLista(proveedorId, path.basename(archivoArg), filas);
    console.log(`El Criollo: ${res.filasImportadas} filas importadas, ${res.vinculados} vinculadas a producto existente.`);
  } else if (proveedorArg === "emporio") {
    const filas = parsearListaElEmporio(buffer);
    const proveedorId = await buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO);
    const res = await importarLista(proveedorId, path.basename(archivoArg), filas);
    console.log(`El Emporio: ${res.filasImportadas} filas importadas, ${res.vinculados} vinculadas a producto existente.`);
  } else {
    console.error('Proveedor desconocido — usá "criollo" o "emporio".');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
