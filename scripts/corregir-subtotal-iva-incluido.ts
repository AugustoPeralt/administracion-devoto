/**
 * Segunda tanda de correcciones encontradas en la auditoría final del
 * 2026-07-24 — esta vez en renglones SIN descuento propio (el chequeo anterior
 * solo miraba renglones CON descuento, así que estos nunca se habían
 * revisado). Mismo patrón que ya se había corregido para Frigorífico HT: el
 * subtotal quedó guardado con IVA incluido en vez del neto —
 * cantidad × precio_unitario (el propio código ya documentaba esto como un
 * problema conocido de "distribuidoras de vino", ver comentario de subtotal
 * en confirmarFactura()):
 *
 * - ALDOS WINE GROUP S. R. L (5 renglones, facturas #27 y #42): subtotal
 *   guardado = neto × 1.21 (IVA 21%, la alícuota de vinos).
 * - SOLO RICOS VINOS S.R.L (6 renglones, factura #12): mismo patrón, ×1.21.
 * - FRIGORIFICO HT S.R.L (6 renglones más, facturas #6 y #74, además de los
 *   6 ya corregidos antes en facturas #28/#51): mismo patrón que esas,
 *   ×1.105 (IVA 10.5%, carnes).
 *
 * Fix: recalcular subtotal = cantidad × precio_unitario − descuento.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const resultado = await db.execute(sql`
    UPDATE cp_detalle_facturas df
    SET subtotal = (df.cantidad * df.precio_unitario - COALESCE(df.descuento, 0))
    FROM cp_productos p, cp_proveedores prov
    WHERE df.producto_id = p.id AND p.proveedor_id = prov.id
      AND prov.nombre IN ('ALDOS WINE GROUP S. R. L', 'SOLO RICOS VINOS S.R.L', 'FRIGORIFICO HT S.R.L')
      AND df.precio_unitario IS NOT NULL AND df.subtotal IS NOT NULL
      AND ABS(df.subtotal - (df.cantidad * df.precio_unitario - COALESCE(df.descuento, 0))) > 1
    RETURNING df.id
  `);
  console.log(`Filas corregidas: ${resultado.rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
