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
  { caja: "TAVLON", nombre: "JAKIM", palabrasClave: ["JAKIM"] },
];

async function main() {
  let creados = 0;
  for (const def of DEFINICIONES) {
    const [caja] = await db.select().from(cajas).where(eq(cajas.nombre, def.caja)).limit(1);
    if (!caja) {
      console.warn(`[AVISO] Caja "${def.caja}" no encontrada, se omite "${def.nombre}".`);
      continue;
    }

    const existentes = await db
      .select()
      .from(alquileresEfectivo)
      .where(and(eq(alquileresEfectivo.cajaId, caja.id), eq(alquileresEfectivo.nombre, def.nombre)));

    if (existentes.length > 0) {
      console.log(`  ${def.caja} / ${def.nombre}: ya existe, se omite.`);
      continue;
    }

    await db.insert(alquileresEfectivo).values({
      cajaId: caja.id,
      nombre: def.nombre,
      palabrasClave: def.palabrasClave.join(","),
    });
    creados++;
    console.log(`  ${def.caja} / ${def.nombre}: creado (palabras: ${def.palabrasClave.join(", ")})`);
  }
  console.log(`\n${creados} alquiler(es) en efectivo sembrado(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
