/**
 * Corrige dos bugs de extracción encontrados el 2026-07-23 al auditar por qué
 * ciertos renglones quedaban "sin verificar" en el Historial de Compras:
 *
 * 1) El Criollo / HORECA (78 renglones): la IA a veces vuelve a extraer el 10%
 *    de descuento de lista como si fuera un "descuento" propio del renglón —
 *    pero ese 10% YA está incluido en precio_unitario (confirmado contra la
 *    factura real: cantidad × P.U. = Total impreso, sin resta adicional). El
 *    resultado es un subtotal que resta el 10% DOS VECES. El subtotal_impreso
 *    (el número real de la factura) es siempre el valor correcto — se
 *    confirmó que coincide exactamente con cantidad × precio_unitario en
 *    todos los casos. Fix: descuento -> NULL, subtotal -> subtotal_impreso.
 *
 * 2) FRIGORIFICO HT S.R.L (6 renglones, facturas #28 y #51): el subtotal
 *    quedó guardado con el valor de la columna "Subtotal c/IVA" de la factura
 *    (bruto) en vez de la columna "Subtotal" (neto) — se ve clarísimo en la
 *    foto: para CHORIZO, PECHO y CHINCHULIN el subtotal guardado es
 *    exactamente el neto × 1.105 (10.5% de IVA que factura este proveedor).
 *    Fix: recalcular subtotal = cantidad × precio_unitario − descuento (la
 *    fórmula que el sistema usa siempre), restaurando el neto correcto.
 *
 * Ambos casos fueron confirmados contra la foto original de la factura antes
 * de tocar nada. Idempotente: si se corre dos veces, la segunda vez no
 * encuentra filas para corregir (el WHERE ya no matchea).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Corrigiendo El Criollo / HORECA (descuento duplicado) ===");
  const criolloHoreca = await db.execute(sql`
    UPDATE cp_detalle_facturas df
    SET descuento = NULL, subtotal = df.subtotal_impreso
    FROM cp_productos p, cp_proveedores prov
    WHERE df.producto_id = p.id AND p.proveedor_id = prov.id
      AND prov.nombre IN ('Distribuidora El Criollo SRL', 'HORECA SRL')
      AND df.descuento IS NOT NULL
      AND df.subtotal_impreso IS NOT NULL
      AND ABS(df.subtotal - df.subtotal_impreso) > 1
    RETURNING df.id
  `);
  console.log(`Filas corregidas: ${criolloHoreca.rows.length}`);

  console.log("\n=== Corrigiendo FRIGORIFICO HT S.R.L (subtotal con IVA en vez de neto) ===");
  const frigorifico = await db.execute(sql`
    UPDATE cp_detalle_facturas df
    SET subtotal = (df.cantidad * df.precio_unitario - COALESCE(df.descuento, 0))
    FROM cp_productos p, cp_proveedores prov
    WHERE df.producto_id = p.id AND p.proveedor_id = prov.id
      AND prov.nombre = 'FRIGORIFICO HT S.R.L'
      AND df.descuento IS NOT NULL
      AND df.subtotal_impreso IS NULL
      AND ABS(df.subtotal - (df.cantidad * df.precio_unitario - COALESCE(df.descuento, 0))) > 1
    RETURNING df.id
  `);
  console.log(`Filas corregidas: ${frigorifico.rows.length}`);

  // Esas mismas filas de Frigorífico quedarían "sin verificar" para siempre
  // (no tienen subtotal_impreso con qué comparar) aunque el valor ya esté
  // bien — confirmamos a mano contra la foto que la columna "Subtotal" de esa
  // factura es exactamente cantidad × precio_unitario (%Bonif=0,00 en las 6),
  // así que completamos subtotal_impreso = subtotal para que el chequeo de
  // verificación las reconozca como correctas de ahora en más.
  const completadas = await db.execute(sql`
    UPDATE cp_detalle_facturas df
    SET subtotal_impreso = df.subtotal
    FROM cp_productos p, cp_proveedores prov
    WHERE df.producto_id = p.id AND p.proveedor_id = prov.id
      AND prov.nombre = 'FRIGORIFICO HT S.R.L'
      AND df.id IN (100, 101, 102, 229, 230, 231)
      AND df.subtotal_impreso IS NULL
    RETURNING df.id
  `);
  console.log(`Filas con subtotal_impreso completado: ${completadas.rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
