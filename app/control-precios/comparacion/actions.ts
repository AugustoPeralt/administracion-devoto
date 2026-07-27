"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { cpListasPreciosProveedor, cpParesPreciosProveedores, cpProductos } from "@/db/schema";
import { NOMBRE_PROVEEDOR_EL_CRIOLLO } from "@/lib/control-precios/constantes";
import {
  buscarProveedorIdPorNombre,
  NOMBRE_PROVEEDOR_EL_EMPORIO,
} from "@/lib/control-precios/consultas";
import { normalizarNombreProducto } from "@/lib/control-precios/normalizar";
import { parsearListaElCriollo, parsearListaElEmporio, type FilaListaPrecio } from "@/lib/control-precios/listas-precios";
import { and, eq, notInArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requerirSesion() {
  return auth().then((session) => {
    if (!session?.user?.email) throw new Error("No autorizado.");
    return session;
  });
}

async function importarLista(proveedorId: number, archivoOrigen: string, filas: FilaListaPrecio[]) {
  if (filas.length === 0) {
    throw new Error("No se reconoció ninguna fila de producto en el archivo — revisá que sea el formato esperado.");
  }

  // Autovínculo con nuestro propio catálogo de este proveedor: solo por nombre
  // normalizado EXACTO (mismo proveedor, mismo estilo de nombre — sin
  // ambigüedad). No se usa acá el matcher difuso (sonNombresSimilares) porque
  // esto alimenta directo el precio "real vs estimado" de la comparación, y un
  // match aproximado incorrecto mostraría el precio de un producto distinto
  // como si fuera el real de este.
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

  // Los códigos que ya no vienen en el archivo nuevo dejaron de existir en el
  // catálogo del proveedor — se borran (arrastra en cascada su par confirmado,
  // si tenía: ya no hay nada que emparejar con un producto que se dio de baja).
  const codigosNuevos = filas.map((f) => f.codigoProveedor);
  await db
    .delete(cpListasPreciosProveedor)
    .where(
      and(
        eq(cpListasPreciosProveedor.proveedorId, proveedorId),
        notInArray(cpListasPreciosProveedor.codigoProveedor, codigosNuevos)
      )
    );

  revalidatePath("/control-precios/comparacion");
  return { archivo: archivoOrigen, filasImportadas: filas.length, productosVinculados: vinculados };
}

async function leerArchivo(formData: FormData): Promise<{ nombre: string; buffer: Buffer }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) throw new Error("Falta el archivo.");
  const buffer = Buffer.from(await archivo.arrayBuffer());
  return { nombre: archivo.name, buffer };
}

export async function importarListaElCriollo(formData: FormData) {
  await requerirSesion();
  const { nombre, buffer } = await leerArchivo(formData);
  const filas = parsearListaElCriollo(buffer);
  const proveedorId = await buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO);
  return importarLista(proveedorId, nombre, filas);
}

export async function importarListaElEmporio(formData: FormData) {
  await requerirSesion();
  const { nombre, buffer } = await leerArchivo(formData);
  const filas = parsearListaElEmporio(buffer);
  const proveedorId = await buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO);
  return importarLista(proveedorId, nombre, filas);
}

/** Confirma que dos renglones (uno de cada lista) son el mismo producto real.
 * Si cualquiera de los dos ya tenía un par, lo reemplaza — una fila solo puede
 * estar emparejada con una sola del otro lado a la vez. */
export async function crearParPrecio(listaAId: number, listaBId: number) {
  await requerirSesion();
  await db
    .delete(cpParesPreciosProveedores)
    .where(
      or(
        eq(cpParesPreciosProveedores.listaAId, listaAId),
        eq(cpParesPreciosProveedores.listaBId, listaAId),
        eq(cpParesPreciosProveedores.listaAId, listaBId),
        eq(cpParesPreciosProveedores.listaBId, listaBId)
      )
    );
  await db.insert(cpParesPreciosProveedores).values({ listaAId, listaBId, confirmado: true });
  revalidatePath("/control-precios/comparacion");
}

/** Elimina un par, esté confirmado o sea todavía una sugerencia pendiente —
 * "quitar" un confirmado y "descartar" una sugerencia son la misma operación. */
export async function eliminarParPrecio(parId: number) {
  await requerirSesion();
  await db.delete(cpParesPreciosProveedores).where(eq(cpParesPreciosProveedores.id, parId));
  revalidatePath("/control-precios/comparacion");
}

/** Confirma una sugerencia pendiente (creada por la IA o por una carga previa)
 * como par real — mismo criterio que crearParPrecio: si cualquiera de las dos
 * filas ya tenía OTRO par confirmado, lo reemplaza. */
export async function confirmarSugerencia(parId: number) {
  await requerirSesion();
  const [sugerencia] = await db.select().from(cpParesPreciosProveedores).where(eq(cpParesPreciosProveedores.id, parId));
  if (!sugerencia) throw new Error("La sugerencia ya no existe — puede que se haya descartado desde otra pestaña.");

  await db
    .delete(cpParesPreciosProveedores)
    .where(
      and(
        eq(cpParesPreciosProveedores.confirmado, true),
        or(
          eq(cpParesPreciosProveedores.listaAId, sugerencia.listaAId),
          eq(cpParesPreciosProveedores.listaBId, sugerencia.listaAId),
          eq(cpParesPreciosProveedores.listaAId, sugerencia.listaBId),
          eq(cpParesPreciosProveedores.listaBId, sugerencia.listaBId)
        )
      )
    );
  await db.update(cpParesPreciosProveedores).set({ confirmado: true }).where(eq(cpParesPreciosProveedores.id, parId));
  revalidatePath("/control-precios/comparacion");
}
