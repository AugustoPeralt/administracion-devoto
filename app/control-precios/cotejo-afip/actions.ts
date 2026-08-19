"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { cpAfipExclusiones } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  cotejarComprobantesAfip,
  ErrorParseoAfip,
  parsearExcelAfip,
  type MotivoExclusionAfip,
  type ResultadoCotejo,
} from "@/lib/control-precios/cotejo-afip";

async function requerirSesion() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("No autorizado.");
}

export type RespuestaCotejoAfip = { ok: true; resultado: ResultadoCotejo } | { ok: false; error: string };

export async function cotejarAfip(formData: FormData): Promise<RespuestaCotejoAfip> {
  await requerirSesion();

  const archivo = formData.get("archivo");
  const localId = Number(formData.get("localId"));
  const localNombre = String(formData.get("localNombre") ?? "");
  const periodo = formData.get("periodo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Subí el excel de Mis Comprobantes Recibidos de ARCA." };
  }
  if (!localId || !localNombre) {
    return { ok: false, error: "Elegí el restaurante." };
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const comprobantes = await parsearExcelAfip(buffer);
    const resultado = await cotejarComprobantesAfip(
      comprobantes,
      { id: localId, nombre: localNombre },
      typeof periodo === "string" && periodo ? periodo : undefined
    );
    return { ok: true, resultado };
  } catch (err) {
    if (err instanceof ErrorParseoAfip) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo procesar el excel." };
  }
}

/** Marca un CUIT como "no es un proveedor de productos" (alquiler, servicio,
 * plataforma de delivery, etc.) — global, no por restaurante (ver comentario en
 * cpAfipExclusiones, db/schema.ts). A partir de acá el cotejo lo saca solo en
 * cualquier restaurante/período. */
export async function excluirProveedorAfip(cuit: string, nombre: string, motivo: MotivoExclusionAfip) {
  await requerirSesion();
  await db
    .insert(cpAfipExclusiones)
    .values({ cuit, nombre, motivo })
    .onConflictDoUpdate({ target: cpAfipExclusiones.cuit, set: { nombre, motivo } });
}

/** Deshace una exclusión (por si se marcó por error) — vuelve a aparecer en el
 * próximo cotejo si sigue habiendo diferencia real. */
export async function quitarExclusionAfip(cuit: string) {
  await requerirSesion();
  await db.delete(cpAfipExclusiones).where(eq(cpAfipExclusiones.cuit, cuit));
}
