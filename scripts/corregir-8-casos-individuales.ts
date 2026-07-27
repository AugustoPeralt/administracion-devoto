/**
 * Corrección uno por uno de los 8 casos restantes de la auditoría del
 * 2026-07-24 — cada uno se bajó y se comparó contra la foto real de la
 * factura antes de tocar nada. A diferencia de los fixes anteriores (que
 * siempre corregían `subtotal`), acá el campo roto varía caso a caso:
 *
 * 1) BARRACAS LOGISTICA (ids 495, 496): mismo bug que ya vimos en vinos y
 *    Frigorífico — subtotal quedó con IVA + Imp. Internos incluidos en vez
 *    del neto. Fix: subtotal = cantidad × precio_unitario.
 *
 * 2) DE BODEGAS ESMERALDA (id 87, "SAINT FELICIE"): la IA extrajo el
 *    PREC.UNIT de lista ($83.801,65) en vez del PRECIO NETO ya con el 50% de
 *    bonificación aplicado ($41.900,83) — el renglón de al lado de la misma
 *    factura (NICASIA VINE, id 88) sí lo extrajo bien, confirmando que es un
 *    error puntual de este renglón, no del formato. El subtotal actual YA es
 *    correcto (coincide con el Importe real). Fix: precio_unitario = 41900.83
 *    (subtotal no se toca).
 *
 * 3) DOMIRA (id 2, "VAINILLA FRENCH"): mismo caso — se guardó el P.U. de
 *    lista ($52.880,00) en vez del "PU c/desc" con el 3% de descuento por
 *    artículo ya aplicado ($51.293,60). Subtotal ya correcto. Fix:
 *    precio_unitario = 51293.60.
 *
 * 4) JUAN GRANDE (id 384, "Queso Halloumi"): la factura real dice 26,220 kg,
 *    se guardó 26,00 (truncado). Precio_unitario y subtotal ya correctos.
 *    Fix: cantidad = 26.22.
 *
 * 5) LOGISTICA LA SERENISIMA (ids 271, 272): la factura tiene una "OFERTA
 *    TRANSITORIA" real de -5% que el subtotal SÍ tiene en cuenta
 *    correctamente, pero el campo descuento quedó en null. Fix: completar
 *    descuento (no tocar subtotal, que ya es el correcto).
 *
 * 6) PUTRUELE (id 52, "Cerveza PERONI"): descuento compuesto real de 40% +
 *    24% impreso en la factura, subtotal ya correcto, descuento en null.
 *    Fix: completar descuento.
 *
 * 7) R&HL (id 276, "CAFFE IN GRANI"): la factura empaqueta 2 unidades de 3kg
 *    por caja ("2*3 KGS" en la columna Contenido) — se compraron 5 cajas =
 *    10 unidades de 3kg, no 5. Precio_unitario y subtotal (por unidad de
 *    3kg) ya son correctos. Fix: cantidad = 10.
 *
 * 8) VINOS ANDINOS (ids 443, 444): 50% de descuento real impreso (%Dto),
 *    subtotal ya correcto, descuento en null. Fix: completar descuento.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db";
import { cpDetalleFacturas } from "../db/schema";
import { eq } from "drizzle-orm";

async function main() {
  // 1) Barracas Logística — subtotal con impuestos incluidos, recalcular neto.
  await db.update(cpDetalleFacturas).set({ subtotal: "55128.00" }).where(eq(cpDetalleFacturas.id, 495));
  await db.update(cpDetalleFacturas).set({ subtotal: "18376.00" }).where(eq(cpDetalleFacturas.id, 496));

  // 2) De Bodegas Esmeralda — precio_unitario mal leído (de lista, no neto).
  await db.update(cpDetalleFacturas).set({ precioUnitario: "41900.83" }).where(eq(cpDetalleFacturas.id, 87));

  // 3) Domira — mismo caso.
  await db.update(cpDetalleFacturas).set({ precioUnitario: "51293.60" }).where(eq(cpDetalleFacturas.id, 2));

  // 4) Juan Grande — cantidad truncada.
  await db.update(cpDetalleFacturas).set({ cantidad: "26.22" }).where(eq(cpDetalleFacturas.id, 384));

  // 5) Logística La Serenísima — completar descuento (oferta transitoria -5%).
  await db.update(cpDetalleFacturas).set({ descuento: "9882.00" }).where(eq(cpDetalleFacturas.id, 271));
  await db.update(cpDetalleFacturas).set({ descuento: "10870.20" }).where(eq(cpDetalleFacturas.id, 272));

  // 6) Putruele — completar descuento (40%+24% compuesto).
  await db.update(cpDetalleFacturas).set({ descuento: "108417.02" }).where(eq(cpDetalleFacturas.id, 52));

  // 7) R&HL — cantidad real (2 unidades de 3kg por caja × 5 cajas).
  await db.update(cpDetalleFacturas).set({ cantidad: "10.00" }).where(eq(cpDetalleFacturas.id, 276));

  // 8) Vinos Andinos — completar descuento (50%).
  await db.update(cpDetalleFacturas).set({ descuento: "142809.90" }).where(eq(cpDetalleFacturas.id, 443));
  await db.update(cpDetalleFacturas).set({ descuento: "119008.26" }).where(eq(cpDetalleFacturas.id, 444));

  console.log("Listo — 12 renglones corregidos (2+1+1+1+2+1+1+2).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
