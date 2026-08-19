"use server";

import { auth } from "@/auth";
import {
  cotejarComprobantesAfip,
  ErrorParseoAfip,
  parsearExcelAfip,
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
