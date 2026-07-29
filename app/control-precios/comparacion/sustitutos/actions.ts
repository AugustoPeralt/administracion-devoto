"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { cpSustitutosProducto } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requerirSesion() {
  return auth().then((session) => {
    if (!session?.user?.email) throw new Error("No autorizado.");
    return session;
  });
}

/** Descarta un sustituto que resultó estar mal — no vuelve a aparecer porque
 * el script de sugerencias no reinserta un par ya borrado (ver comentario en
 * scripts/generar-sugerencias-sustitutos.ts). */
export async function descartarSustituto(sustitutoId: number) {
  await requerirSesion();
  await db.delete(cpSustitutosProducto).where(eq(cpSustitutosProducto.id, sustitutoId));
  revalidatePath("/control-precios/comparacion/sustitutos");
}
