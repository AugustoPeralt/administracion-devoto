/**
 * Prueba la fusión de proveedores SIN dejar nada guardado: corre fusionarProveedores()
 * de verdad dentro de una transacción, imprime el estado resultante, y hace ROLLBACK.
 *
 * Uso: npx tsx scripts/probar-fusion-proveedores.ts <canonicoId> <duplicadoId>
 * Ej:  npx tsx scripts/probar-fusion-proveedores.ts 3 21   (Cubetto Hielo Gourmet <- Cubetto)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { fusionarProveedoresInterno } from "../app/control-precios/actions";

class RollbackIntencional extends Error {}

async function main() {
  const canonicoId = Number(process.argv[2]);
  const duplicadoId = Number(process.argv[3]);
  if (!Number.isInteger(canonicoId) || !Number.isInteger(duplicadoId)) {
    console.error("Uso: npx tsx scripts/probar-fusion-proveedores.ts <canonicoId> <duplicadoId>");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      console.log("--- Antes de fusionar ---");
      console.log(
        "Facturas del duplicado:",
        (await tx.select().from(schema.cpFacturas).where(eq(schema.cpFacturas.proveedorId, duplicadoId))).length
      );
      console.log(
        "Productos del duplicado:",
        (await tx.select().from(schema.cpProductos).where(eq(schema.cpProductos.proveedorId, duplicadoId))).length
      );

      await fusionarProveedoresInterno(canonicoId, duplicadoId, tx);

      console.log("\n--- Después de fusionar (dentro de la transacción) ---");
      const proveedorDuplicadoSigueExistiendo = await tx
        .select()
        .from(schema.cpProveedores)
        .where(eq(schema.cpProveedores.id, duplicadoId));
      console.log("¿El duplicado todavía existe?", proveedorDuplicadoSigueExistiendo.length > 0);

      const facturasCanonico = await tx
        .select()
        .from(schema.cpFacturas)
        .where(eq(schema.cpFacturas.proveedorId, canonicoId));
      console.log("Facturas ahora bajo el canónico:", facturasCanonico.length);

      const productosCanonico = await tx
        .select()
        .from(schema.cpProductos)
        .where(eq(schema.cpProductos.proveedorId, canonicoId));
      console.log(
        "Productos ahora bajo el canónico:",
        productosCanonico.map((p) => p.nombre)
      );

      throw new RollbackIntencional();
    });
  } catch (error) {
    if (!(error instanceof RollbackIntencional)) throw error;
    console.log("\n✅ ROLLBACK aplicado — no quedó nada guardado en la base real.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
