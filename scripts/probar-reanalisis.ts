/**
 * Prueba reanalizarFactura() contra una foto real ya guardada en Blob, de solo
 * lectura (no escribe nada en la base) — imprime la comparación entre lo guardado
 * y la nueva lectura de la IA.
 *
 * Uso: npx tsx scripts/probar-reanalisis.ts <facturaId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../db/schema";
import { reanalizarFacturaInterno } from "../app/control-precios/actions";

async function main() {
  const facturaId = Number(process.argv[2]);
  if (!Number.isInteger(facturaId)) {
    console.error("Uso: npx tsx scripts/probar-reanalisis.ts <facturaId>");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const items = await reanalizarFacturaInterno(facturaId, db);
    console.log(`\nFactura #${facturaId} — ${items.length} ítem(s) leídos por la IA:\n`);
    for (const it of items) {
      const coincide =
        it.subtotalActual !== null && it.subtotalIA !== null && Math.abs(it.subtotalActual - it.subtotalIA) <= 1;
      console.log(`- ${it.productoNombre}${it.detalleId === null ? " [SIN MATCH EN BD]" : ""}`);
      console.log(`    cantidad: ${it.cantidad}`);
      console.log(`    precio         BD=${it.precioActual ?? "—"}   IA=${it.precioIA ?? "—"}`);
      console.log(`    descuento      BD=${it.descuentoActual ?? "—"}   IA=${it.descuentoIA ?? "—"}`);
      console.log(`    subtotal       BD=${it.subtotalActual ?? "—"}   IA=${it.subtotalIA ?? "—"}   ${coincide ? "✅ coincide" : "⚠️ difiere"}`);
      console.log(`    subtotal impr. BD=${it.subtotalImpresoActual ?? "—"}   IA=${it.subtotalImpresoIA ?? "—"}`);
      console.log(`    IVA %          BD=${it.ivaPorcentajeActual ?? "—"}   IA=${it.ivaPorcentajeIA ?? "—"}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
