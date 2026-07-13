"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { justificacionesAuditoria } from "@/db/schema";

export async function justificarMovimiento(formData: FormData) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) {
    throw new Error("Tenés que iniciar sesión para justificar un ajuste.");
  }

  const movimientoId = Number(formData.get("movimientoId"));
  const comentario = String(formData.get("comentario") ?? "").trim();

  if (!Number.isInteger(movimientoId) || !comentario) {
    throw new Error("Falta el comentario para justificar este ajuste.");
  }

  await db.insert(justificacionesAuditoria).values({
    movimientoId,
    usuarioEmail,
    comentario,
  });

  revalidatePath("/consolidados/auditoria");
  revalidatePath("/consolidados");
}
