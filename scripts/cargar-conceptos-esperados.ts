import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { cajas, conceptosEsperados } from "../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Reglas cargadas a partir de analizar los 6 meses reales de datos (ene-jun 2026)
 * en CONSOLIDADO 2026.xlsx: para cada código de titular, en qué cajas aparece de
 * forma consistente (no una sola vez) mes a mes. Ver el resumen en la conversación
 * para el detalle de qué se excluyó y por qué.
 */
const REGLAS: { caja: string; nombre: string; codTitular: number }[] = [
  // Alquiler local (cod 3) — consistente en 5 de 9 cajas
  { caja: "ALICIA", nombre: "Alquiler local", codTitular: 3 },
  { caja: "BETULAR", nombre: "Alquiler local", codTitular: 3 },
  { caja: "LUCCA", nombre: "Alquiler local", codTitular: 3 },
  { caja: "MECHA", nombre: "Alquiler local", codTitular: 3 },
  { caja: "TAVLON", nombre: "Alquiler local", codTitular: 3 },

  // Sueldos operativos (cod 8) — el más consistente de todos, 8 de 9 cajas
  { caja: "6 BLVD", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "ALICIA", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "BENITO", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "BETULAR", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "LUCCA", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "MECHA", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "PEPE", nombre: "Sueldos operativos", codTitular: 8 },
  { caja: "TAVLON", nombre: "Sueldos operativos", codTitular: 8 },

  // Sueldos oficina (cod 9) — 6 cajas
  { caja: "6 BLVD", nombre: "Sueldos oficina", codTitular: 9 },
  { caja: "ALICIA", nombre: "Sueldos oficina", codTitular: 9 },
  { caja: "BETULAR", nombre: "Sueldos oficina", codTitular: 9 },
  { caja: "LUCCA", nombre: "Sueldos oficina", codTitular: 9 },
  { caja: "MECHA", nombre: "Sueldos oficina", codTitular: 9 },
  { caja: "PEPE", nombre: "Sueldos oficina", codTitular: 9 },

  // Policia (cod 7) — 5 cajas
  { caja: "ALICIA", nombre: "Policía", codTitular: 7 },
  { caja: "BETULAR", nombre: "Policía", codTitular: 7 },
  { caja: "LUCCA", nombre: "Policía", codTitular: 7 },
  { caja: "MECHA", nombre: "Policía", codTitular: 7 },
  { caja: "PEPE", nombre: "Policía", codTitular: 7 },

  // German Sistemas abono (cod 12) — 6 cajas
  { caja: "6 BLVD", nombre: "German Sistemas abono", codTitular: 12 },
  { caja: "ALICIA", nombre: "German Sistemas abono", codTitular: 12 },
  { caja: "BETULAR", nombre: "German Sistemas abono", codTitular: 12 },
  { caja: "LUCCA", nombre: "German Sistemas abono", codTitular: 12 },
  { caja: "MECHA", nombre: "German Sistemas abono", codTitular: 12 },
  { caja: "PEPE", nombre: "German Sistemas abono", codTitular: 12 },

  // Confianza media: recurrentes pero con cadencia irregular (parecen pagarse
  // cada 2-4 meses de una vez, no estrictamente todos los meses) — igual se
  // cargan como esperadas mensuales; si generan alertas de más, desactivar
  // desde /alertas/reglas.
  { caja: "6 BLVD", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "ALICIA", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "BETULAR", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "LUCCA", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "MECHA", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "PEPE", nombre: "Alquiler oficina", codTitular: 4 },
  { caja: "TAVLON", nombre: "Alquiler oficina", codTitular: 4 },

  { caja: "6 BLVD", nombre: "Gestión", codTitular: 5 },
  { caja: "ALICIA", nombre: "Gestión", codTitular: 5 },
  { caja: "BETULAR", nombre: "Gestión", codTitular: 5 },
  { caja: "LUCCA", nombre: "Gestión", codTitular: 5 },
  { caja: "MECHA", nombre: "Gestión", codTitular: 5 },
  { caja: "PEPE", nombre: "Gestión", codTitular: 5 },

  { caja: "6 BLVD", nombre: "Contable", codTitular: 6 },
  { caja: "ALICIA", nombre: "Contable", codTitular: 6 },
  { caja: "BETULAR", nombre: "Contable", codTitular: 6 },
  { caja: "LUCCA", nombre: "Contable", codTitular: 6 },
  { caja: "MECHA", nombre: "Contable", codTitular: 6 },
  { caja: "PEPE", nombre: "Contable", codTitular: 6 },
];

async function main() {
  const todasLasCajas = await db.select().from(cajas);
  const idPorNombre = new Map(todasLasCajas.map((c) => [c.nombre, c.id]));

  let creadas = 0;
  let omitidas = 0;

  for (const regla of REGLAS) {
    const cajaId = idPorNombre.get(regla.caja);
    if (!cajaId) {
      console.warn(`[AVISO] No se encontró la caja "${regla.caja}", se omite la regla "${regla.nombre}".`);
      continue;
    }

    const existente = await db
      .select({ id: conceptosEsperados.id })
      .from(conceptosEsperados)
      .where(and(eq(conceptosEsperados.cajaId, cajaId), eq(conceptosEsperados.codTitular, regla.codTitular)))
      .limit(1);

    if (existente.length > 0) {
      omitidas++;
      continue;
    }

    await db.insert(conceptosEsperados).values({
      cajaId,
      nombre: regla.nombre,
      codTitular: regla.codTitular,
    });
    creadas++;
  }

  console.log(`Reglas creadas: ${creadas}`);
  console.log(`Reglas ya existentes (omitidas): ${omitidas}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
