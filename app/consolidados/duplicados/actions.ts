"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { duplicadosRevisados } from "@/db/schema";

async function resolverCaso(formData: FormData, estado: "confirmado" | "justificado") {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) {
    throw new Error("Tenés que iniciar sesión para resolver un caso.");
  }

  const cajaId = Number(formData.get("cajaId"));
  const fecha = String(formData.get("fecha") ?? "");
  const codTitular = Number(formData.get("codTitular"));
  const comentario = String(formData.get("comentario") ?? "").trim();

  if (!Number.isInteger(cajaId) || !fecha || !Number.isInteger(codTitular) || !comentario) {
    throw new Error("Faltan datos para resolver este caso (comentario obligatorio).");
  }

  await db
    .insert(duplicadosRevisados)
    .values({ cajaId, fecha, codTitular, estado, comentario, usuarioEmail })
    .onConflictDoUpdate({
      target: [duplicadosRevisados.cajaId, duplicadosRevisados.fecha, duplicadosRevisados.codTitular],
      set: { estado, comentario, usuarioEmail, creadoEn: new Date() },
    });

  revalidatePath("/consolidados/duplicados");
}

export async function confirmarDuplicado(formData: FormData) {
  await resolverCaso(formData, "confirmado");
}

export async function justificarNoDuplicado(formData: FormData) {
  await resolverCaso(formData, "justificado");
}
