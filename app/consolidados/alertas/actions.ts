"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { alertasHistoricasRevisadas, conceptosEsperados } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function crearConceptoEsperado(formData: FormData) {
  const cajaId = Number(formData.get("cajaId"));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipoCodigo = String(formData.get("tipoCodigo") ?? "");
  const codigo = Number(formData.get("codigo"));
  const palabrasClave = String(formData.get("palabrasClave") ?? "").trim();

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
    palabrasClave: palabrasClave || null,
  });

  revalidatePath("/consolidados/alertas");
  revalidatePath("/consolidados/alertas/reglas");
}

export async function editarPalabrasClaveConcepto(formData: FormData) {
  const id = Number(formData.get("id"));
  const palabrasClave = String(formData.get("palabrasClave") ?? "").trim();
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db
    .update(conceptosEsperados)
    .set({ palabrasClave: palabrasClave || null })
    .where(eq(conceptosEsperados.id, id));

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

async function resolverAlertaHistorica(formData: FormData, estado: "confirmado" | "justificado") {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) {
    throw new Error("Tenés que iniciar sesión para resolver una alerta.");
  }

  const conceptoId = Number(formData.get("conceptoId"));
  const mes = String(formData.get("mes") ?? "");
  const comentario = String(formData.get("comentario") ?? "").trim();

  if (!Number.isInteger(conceptoId) || !/^\d{4}-\d{2}$/.test(mes) || !comentario) {
    throw new Error("Faltan datos para resolver esta alerta (comentario obligatorio).");
  }

  await db
    .insert(alertasHistoricasRevisadas)
    .values({ conceptoId, mes, estado, comentario, usuarioEmail })
    .onConflictDoUpdate({
      target: [alertasHistoricasRevisadas.conceptoId, alertasHistoricasRevisadas.mes],
      set: { estado, comentario, usuarioEmail, creadoEn: new Date() },
    });

  revalidatePath("/consolidados/alertas");
}

export async function confirmarAlertaHistorica(formData: FormData) {
  await resolverAlertaHistorica(formData, "confirmado");
}

export async function justificarAlertaHistorica(formData: FormData) {
  await resolverAlertaHistorica(formData, "justificado");
}
