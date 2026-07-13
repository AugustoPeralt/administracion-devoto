"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alquileresEfectivo } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function crearAlquilerEfectivo(formData: FormData) {
  const cajaId = Number(formData.get("cajaId"));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const palabrasClaveRaw = String(formData.get("palabrasClave") ?? "").trim();
  const codTitular = Number(formData.get("codTitular") || 3);

  if (!Number.isInteger(cajaId) || !nombre) {
    throw new Error("Faltan datos: caja y nombre son obligatorios.");
  }

  // Normaliza "a, b ,c" -> "a,b,c"; vacío = catch-all (todo lo no matcheado de esa caja).
  const palabrasClave = palabrasClaveRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(",");

  await db.insert(alquileresEfectivo).values({ cajaId, nombre, palabrasClave, codTitular });

  revalidatePath("/consolidados/alertas/efectivo");
}

export async function alternarActivoAlquilerEfectivo(formData: FormData) {
  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.update(alquileresEfectivo).set({ activo: !activo }).where(eq(alquileresEfectivo.id, id));

  revalidatePath("/consolidados/alertas/efectivo");
}

export async function eliminarAlquilerEfectivo(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.delete(alquileresEfectivo).where(eq(alquileresEfectivo.id, id));

  revalidatePath("/consolidados/alertas/efectivo");
}
