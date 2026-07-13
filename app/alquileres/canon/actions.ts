"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alqCanonVigenteConfig } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function guardarCanonVigente(formData: FormData) {
  const local = String(formData.get("local") ?? "").trim();
  const diaPagoDesde = Number(formData.get("diaPagoDesde"));
  const diaPagoHasta = Number(formData.get("diaPagoHasta"));
  const proximoAjuste = String(formData.get("proximoAjuste") ?? "").trim() || null;
  const indiceAjuste = String(formData.get("indiceAjuste") ?? "").trim() || null;
  const preavisoProrrogaDias = Number(formData.get("preavisoProrrogaDias"));

  if (!local) throw new Error("Falta el local.");
  if (!Number.isInteger(diaPagoDesde) || diaPagoDesde < 1 || diaPagoDesde > 31) {
    throw new Error("Día de pago desde inválido.");
  }
  if (!Number.isInteger(diaPagoHasta) || diaPagoHasta < 1 || diaPagoHasta > 31) {
    throw new Error("Día de pago hasta inválido.");
  }
  if (!Number.isInteger(preavisoProrrogaDias) || preavisoProrrogaDias < 0) {
    throw new Error("Preaviso de prórroga inválido.");
  }

  await db
    .insert(alqCanonVigenteConfig)
    .values({ local, diaPagoDesde, diaPagoHasta, proximoAjuste, indiceAjuste, preavisoProrrogaDias })
    .onConflictDoUpdate({
      target: alqCanonVigenteConfig.local,
      set: {
        diaPagoDesde: sql`excluded.dia_pago_desde`,
        diaPagoHasta: sql`excluded.dia_pago_hasta`,
        proximoAjuste: sql`excluded.proximo_ajuste`,
        indiceAjuste: sql`excluded.indice_ajuste`,
        preavisoProrrogaDias: sql`excluded.preaviso_prorroga_dias`,
        actualizadoEn: new Date(),
      },
    });

  revalidatePath("/alquileres/canon");
  revalidatePath("/alquileres");
}

export async function eliminarCanonVigente(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Id inválido.");

  await db.delete(alqCanonVigenteConfig).where(eq(alqCanonVigenteConfig.id, id));

  revalidatePath("/alquileres/canon");
  revalidatePath("/alquileres");
}
