import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { cajas, alquileresEfectivo } from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Siembra los alquileres en efectivo (cod_titular=3) identificados a mano contra
 * los movimientos reales de CONSOLIDADO 2026. Cada uno se distingue por palabras
 * clave en descripcion_final/concepto_manual, no por código (ver comentario en
 * db/schema.ts sobre por qué esta es la única excepción al criterio de
 * conceptosEsperados). Uso: npx tsx scripts/seed-alquileres-efectivo.ts
 */
// palabrasClave: [] significa "catch-all" — todo movimiento cod=3 de esa caja que
// no matchee ninguna regla CON palabras clave de la misma caja cae acá. Se usa para
// el alquiler "genérico" de cajas donde el texto libre no tiene un nombre propio
// distintivo (ej. ALICIA: todo lo que no diga NUOVATEC es el alquiler del local).
const DEFINICIONES: { caja: string; nombre: string; palabrasClave: string[] }[] = [
  { caja: "ALICIA", nombre: "NUOVATEC", palabrasClave: ["NUOVATEC", "NOVATEC"] },
  { caja: "ALICIA", nombre: "LOCAL", palabrasClave: [] },
  { caja: "BETULAR", nombre: "ATELIER", palabrasClave: ["ATELIER"] },
  { caja: "BETULAR", nombre: "LOCAL", palabrasClave: [] },
  { caja: "LUCCA", nombre: "LOCAL", palabrasClave: [] },
  { caja: "MECHA", nombre: "LOCAL", palabrasClave: [] },
  { caja: "TAVLON", nombre: "FERRETERIA", palabrasClave: ["FERRETERIA"] },
  { caja: "TAVLON", nombre: "CANONE", palabrasClave: ["CANONE"] },
  // "=ALQUILER TAVLON"/"=ALQUILER LOCAL" (match EXACTO, confirmado por el usuario):
  // dos meses (mar-26, jun-26) donde JAKIM se cargó sin su nombre — sin el modo
  // exacto, "ALQUILER TAVLON" como substring le robaría la fila a FERRETERIA
  // ("ALQUILER TAVLON ferreteria" también la contiene).
  { caja: "TAVLON", nombre: "JAKIM", palabrasClave: ["JAKIM", "=ALQUILER TAVLON", "=ALQUILER LOCAL"] },
  // Confirmado por el usuario: alquiler real aparte que arrancó en mayo-26 (la fila
  // de enero "nuevo local nr 10" NO es parte de esta serie, es otra cosa). Aparece
  // con 2 nombres — "MILITAR" (may-26) → "local daniel" (jun-26) — $980k→$1.070k.
  { caja: "TAVLON", nombre: "MILITAR", palabrasClave: ["MILITAR", "DANIEL"] },
];

async function main() {
  let creados = 0;
  let actualizados = 0;
  for (const def of DEFINICIONES) {
    const [caja] = await db.select().from(cajas).where(eq(cajas.nombre, def.caja)).limit(1);
    if (!caja) {
      console.warn(`[AVISO] Caja "${def.caja}" no encontrada, se omite "${def.nombre}".`);
      continue;
    }

    const palabrasClave = def.palabrasClave.join(",");
    const [existente] = await db
      .select()
      .from(alquileresEfectivo)
      .where(and(eq(alquileresEfectivo.cajaId, caja.id), eq(alquileresEfectivo.nombre, def.nombre)));

    if (existente) {
      if (existente.palabrasClave !== palabrasClave) {
        await db.update(alquileresEfectivo).set({ palabrasClave }).where(eq(alquileresEfectivo.id, existente.id));
        actualizados++;
        console.log(`  ${def.caja} / ${def.nombre}: actualizado (palabras: ${def.palabrasClave.join(", ")})`);
      } else {
        console.log(`  ${def.caja} / ${def.nombre}: sin cambios.`);
      }
      continue;
    }

    await db.insert(alquileresEfectivo).values({ cajaId: caja.id, nombre: def.nombre, palabrasClave });
    creados++;
    console.log(`  ${def.caja} / ${def.nombre}: creado (palabras: ${def.palabrasClave.join(", ")})`);
  }
  console.log(`\n${creados} creado(s), ${actualizados} actualizado(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
