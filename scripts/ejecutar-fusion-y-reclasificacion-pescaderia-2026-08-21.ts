// Ejecuta la reorganización acordada con el usuario (2026-08-21) tras el análisis
// de rubros reales del CBC (ver conversación / artifact "Rubros CBC"):
//   1. Fusiona el duplicado real Agraria Rupay S.A. (id 19, canónico — más
//      facturas y CUIT correcto) <- PESCE FRUTOS DE MAR (id 119, mismo CUIT
//      30708302569 confirmado en el CBC bajo el nombre de fantasía "Pesce",
//      cargado sin CUIT en el sistema).
//   2. Reclasifica a PESCADERIA los proveedores de pescado/frutos de mar que
//      hoy están repartidos entre CARNE y ALMACEN.
//   3. Reclasifica a CARNE el único proveedor avícola (decisión: no crear
//      categoría aparte para un volumen tan chico).
// Deliberadamente NO toca los proveedores de vajilla/menaje (Cook Shop, Volf,
// etc.) — el usuario eligió la versión chica (solo sumar PESCADERIA).
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { fusionarProveedoresInterno } from "../app/control-precios/actions";

const A_PESCADERIA = [50, 267, 274, 20, 195, 104, 263]; // Fresco Pez, Salnikova, Viva Hernan, Nunos, Suli, Melba, Producto Oceanico
const CANONICO_PESCE = 19; // Agraria Rupay S.A. (queda en PESCADERIA también)
const DUPLICADO_PESCE = 119; // PESCE FRUTOS DE MAR
const A_CARNE = [68]; // Avez SRL (avicola)

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db.transaction(async (tx) => {
    // 1. Fusión del duplicado real
    const [dup] = await tx.select().from(schema.cpProveedores).where(eq(schema.cpProveedores.id, DUPLICADO_PESCE));
    if (dup) {
      await fusionarProveedoresInterno(CANONICO_PESCE, DUPLICADO_PESCE, tx);
      console.log(`Fusionado: id ${DUPLICADO_PESCE} ("${dup.nombre}") -> id ${CANONICO_PESCE} (Agraria Rupay S.A.)`);
    } else {
      console.log(`(saltado: id ${DUPLICADO_PESCE} ya no existe)`);
    }

    // 2. Reclasificación a PESCADERIA (incluye al canónico de la fusión)
    const idsPescaderia = [...A_PESCADERIA, CANONICO_PESCE];
    for (const id of idsPescaderia) {
      const [antes] = await tx.select().from(schema.cpProveedores).where(eq(schema.cpProveedores.id, id));
      if (!antes) {
        console.log(`⚠ id ${id} no encontrado, se salta`);
        continue;
      }
      await tx.update(schema.cpProveedores).set({ categoria: "PESCADERIA" }).where(eq(schema.cpProveedores.id, id));
      console.log(`"${antes.nombre}" (id ${id}): ${antes.categoria} -> PESCADERIA`);
    }

    // 3. Reclasificación a CARNE (avícola)
    for (const id of A_CARNE) {
      const [antes] = await tx.select().from(schema.cpProveedores).where(eq(schema.cpProveedores.id, id));
      if (!antes) {
        console.log(`⚠ id ${id} no encontrado, se salta`);
        continue;
      }
      await tx.update(schema.cpProveedores).set({ categoria: "CARNE" }).where(eq(schema.cpProveedores.id, id));
      console.log(`"${antes.nombre}" (id ${id}): ${antes.categoria} -> CARNE`);
    }
  });

  await pool.end();
  console.log("\nListo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
