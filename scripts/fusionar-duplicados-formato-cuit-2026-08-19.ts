// Fusiona proveedores duplicados detectados por scripts/detectar-duplicados-cuit-tmp.ts
// (mismo CUIT real, guardado con y sin guiones -> buscarOCrearProveedor() no los
// reconocía como el mismo por comparar el CUIT crudo sin normalizar, ver commit que
// arregla eso). El canónico es siempre la fila más vieja/con más facturas ya
// vinculadas; se descartan a propósito los dos casos donde el mismo CUIT aparece
// bajo nombres de empresas real y evidentemente distintas (posible CUIT mal
// cargado en una de las dos) — esos quedan para revisión humana, no se tocan acá.
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { fusionarProveedoresInterno } from "../app/control-precios/actions";

// [canonicoId, duplicadoId] — canonico = fila con más facturas ya cargadas.
const FUSIONES: [number, number][] = [
  [5, 162], // Frigorifico HT SRL
  [7, 160], // Horeca SRL
  [8, 159], // Distribuidora El Criollo SRL
  [9, 157], // Alyser S.A.
  [12, 163], // Aldos Wine Group SRL
  [14, 137], // Podic SA <- "Kaiken" (trade name)
  [18, 108], // De Bodegas Esmeralda S.A. <- "Catena Zapata" (trade name)
  [20, 168], // Nunos S.A.
  [33, 125], // Vittorio's <- Quail Group S.R.L. (razón social)
  [35, 167], // Logistica La Serenisima S.A.
  [36, 172], // R&HL Sociedad Anónima
  [45, 166], // Juan Grande S.A.
  [49, 140], // Vinos Andinos SRL <- "Vinandina" (trade name)
  [51, 158], // La Meson S.R.L.
  [24, 161], // Coca-Cola FEMSA de Buenos Aires S.A.
  [65, 164], // El Fundador
  [87, 169], // Bodegas Salentein S.A.
  [92, 165], // Pasturas de Cazon
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db.transaction(async (tx) => {
    for (const [canonicoId, duplicadoId] of FUSIONES) {
      const [antes] = await tx.select().from(schema.cpProveedores).where(eq(schema.cpProveedores.id, duplicadoId));
      if (!antes) {
        console.log(`(saltado: id ${duplicadoId} ya no existe, ¿corrida repetida?)`);
        continue;
      }
      await fusionarProveedoresInterno(canonicoId, duplicadoId, tx);
      console.log(`Fusionado: id ${duplicadoId} ("${antes.nombre}") -> id ${canonicoId}`);
    }

    // Fila espuria propia: "Podic SA" (id 245) se creó con el CUIT del propio
    // restaurante (30717775348, self-referencia por una fórmula desactualizada en
    // el CBC de origen — ver conversación 2026-08-19) en vez de un proveedor real.
    // La verdadera "Podic SA"/"Kaiken" ya quedó fusionada arriba (id 14). Sin
    // facturas vinculadas todavía (se creó hoy), se borra directo.
    const [espuria] = await tx.select().from(schema.cpProveedores).where(eq(schema.cpProveedores.id, 245));
    if (espuria && espuria.cuit === "30717775348") {
      const facturas = await tx.select().from(schema.cpFacturas).where(eq(schema.cpFacturas.proveedorId, 245));
      if (facturas.length === 0) {
        await tx.delete(schema.cpProveedores).where(eq(schema.cpProveedores.id, 245));
        console.log(`Borrada fila espuria: id 245 "${espuria.nombre}" (CUIT era el del propio restaurante, sin facturas vinculadas)`);
      } else {
        console.log(`⚠ id 245 tiene ${facturas.length} factura(s) vinculada(s) — no se borra, revisar a mano.`);
      }
    }
  });

  await pool.end();
  console.log("\nListo.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
