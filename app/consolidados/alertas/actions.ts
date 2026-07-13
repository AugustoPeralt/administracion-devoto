"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { conceptosEsperados } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function crearConceptoEsperado(formData: FormData) {
  const cajaId = Number(formData.get("cajaId"));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipoCodigo = String(formData.get("tipoCodigo") ?? "");
  const codigo = Number(formData.get("codigo"));

  if (!Number.isInteger(cajaId) || !nombre || !Number.isInteger(codigo)) {
    throw new Error("Faltan datos: caja, nombre y código son obligatorios.");
  }
  if (tipoCodigo !== "titular" && tipoCodigo !== "cuenta") {
    throw new Error("El tipo de código debe ser 'titular' o 'cuenta'.");
  }

  await db.insert(conceptosEsperados).values({
    cajaId,
    nombre,
    codTitular: tipoCodigo === "titular" ? codigo : null,
    codCuenta: tipoCodigo === "cuenta" ? codigo : null,
  });

  revalidatePath("/consolidados/alertas");
  revalidatePath("/consolidados/alertas/reglas");
}

export async function alternarActivoConcepto(formData: FormData) {
  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.update(conceptosEsperados).set({ activo: !activo }).where(eq(conceptosEsperados.id, id));

  revalidatePath("/consolidados/alertas");
  revalidatePath("/consolidados/alertas/reglas");
}

export async function eliminarConceptoEsperado(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.delete(conceptosEsperados).where(eq(conceptosEsperados.id, id));

  revalidatePath("/consolidados/alertas");
  revalidatePath("/consolidados/alertas/reglas");
}
