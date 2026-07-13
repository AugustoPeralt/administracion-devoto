"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alqLocalesMapping } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function crearMapeo(formData: FormData) {
  const proveedorCbc = String(formData.get("proveedorCbc") ?? "").trim();
  const localCanonico = String(formData.get("localCanonico") ?? "").trim();

  if (!proveedorCbc || !localCanonico) {
    throw new Error("Faltan datos: proveedor CBC y local canónico son obligatorios.");
  }

  await db
    .insert(alqLocalesMapping)
    .values({ proveedorCbc, localCanonico })
    .onConflictDoUpdate({
      target: alqLocalesMapping.proveedorCbc,
      set: { localCanonico: sql`excluded.local_canonico`, activo: true },
    });

  revalidatePath("/alquileres/mapeos");
}

export async function alternarActivoMapeo(formData: FormData) {
  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.update(alqLocalesMapping).set({ activo: !activo }).where(eq(alqLocalesMapping.id, id));

  revalidatePath("/alquileres/mapeos");
}

export async function eliminarMapeo(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.delete(alqLocalesMapping).where(eq(alqLocalesMapping.id, id));

  revalidatePath("/alquileres/mapeos");
}
