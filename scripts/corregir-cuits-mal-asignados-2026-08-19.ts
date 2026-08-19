// Corrige tres proveedores con CUIT mal asignado, encontrados investigando por
// qué el cotejo AFIP de Mecha mostraba facturas de Quilmes/Frigorífico HT como
// "cargadas pero no en AFIP" siendo falso (conversación 2026-08-19):
//
// - id 73 "CERVECERIA Y MALTERIA QUILMES..." y id 129 "FRIGORIFICO H T S.R.L."
//   tenían guardado el CUIT del PROPIO RESTAURANTE (Mecha, 30715696602) en vez
//   del CUIT real del proveedor -- típico error de lectura de IA cuando la
//   factura tiene impreso tanto el CUIT del emisor como el del receptor y se
//   confunden. Como nunca va a existir un comprobante de AFIP con el proveedor
//   emitiéndose una factura a sí mismo, esas facturas quedaban matemáticamente
//   imposibles de cruzar.
// - id 44 "CHRISTUFRUT" tenía el CUIT real de Avícola Ezeiza (id 31, que sí
//   matcheó correctamente contra AFIP) -- mismo tipo de error, entre dos
//   proveedores reales distintos.
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { fusionarProveedoresInterno } from "../app/control-precios/actions";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db.transaction(async (tx) => {
    // Quilmes: el canónico pasa a ser id 176 (el único con el CUIT real
    // confirmado, 33508358259) aunque tenga 0 facturas todavía -- fusionarProveedoresInterno
    // no toca el cuit del canónico, así que absorbe las facturas de los otros
    // dos sin heredar ningún CUIT incorrecto.
    await fusionarProveedoresInterno(176, 73, tx);
    console.log("Fusionado: id 73 (CUIT era el del propio Mecha) -> id 176 (CUIT real 33508358259)");
    await fusionarProveedoresInterno(176, 90, tx);
    console.log("Fusionado: id 90 (sin CUIT) -> id 176");

    // Frigorifico HT: acá el canónico (id 5) ya tenía el CUIT correcto.
    await fusionarProveedoresInterno(5, 129, tx);
    console.log("Fusionado: id 129 (CUIT era el del propio Mecha) -> id 5 (CUIT real 30711901651)");

    // Christufrut: no es Avícola Ezeiza (nombres y rubros no relacionados) --
    // se le limpia el CUIT en vez de fusionar, para no perder sus 11 facturas
    // ni atribuírselas a otro proveedor real por error.
    await tx.update(schema.cpProveedores).set({ cuit: null }).where(eq(schema.cpProveedores.id, 44));
    console.log("Limpiado: id 44 CHRISTUFRUT (tenía el CUIT real de Avícola Ezeiza) -> sin CUIT");
  });

  await pool.end();
  console.log("\nListo.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
