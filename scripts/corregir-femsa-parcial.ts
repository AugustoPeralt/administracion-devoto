/**
 * Corrección de FEMSA — solo los casos que pude confirmar con certeza contra
 * la foto real (2026-07-24). NO toca las facturas #32, #43, #73 porque ahí el
 * precio_unitario mismo queda en duda (ver nota abajo) y no tengo forma de
 * confirmarlo sin una foto más clara.
 *
 * FACTURAS #19, #35, #97 — mismo layout (P.UNITARIO | PRECIO NETO | DESCUENTO
 * | SUBTOTAL neto | IVA | I.INTERNOS | SUBTOTAL bruto): el descuento real
 * (impreso) nunca se capturó (quedó null), y el subtotal guardado es el BRUTO
 * (con IVA+Internos) en vez del neto. Confirmé contra la foto que el % de
 * descuento es 50% (SW591X6), 35% (AQ.*) o 40% (factura 97) según el renglón.
 * Fix: completar descuento y recalcular subtotal = cantidad×precio−descuento.
 *
 * FACTURAS #77, #132 — mismo layout, pero acá el descuento SÍ está bien
 * cargado (coincide con los mismos % de arriba) — el único problema es que
 * subtotal quedó en el valor bruto (o con un redondeo de $1-2). Fix: solo
 * recalcular subtotal con la fórmula, sin tocar descuento.
 *
 * FACTURAS #32, #43, #73 (NO corregidas, quedan para revisión manual): la
 * IA (tanto en la carga original como en un reanálisis con el prompt actual)
 * da resultados CONTRADICTORIOS sobre el precio_unitario real — en #32 por
 * ejemplo, "Precio Neto" (145.821,00) implica un precio unitario de 3.645,53
 * si la cantidad es 40, pero la columna P.UNITARIO impresa dice 7.291,05 (el
 * mismo precio que en el resto de las facturas). La foto tiene un doblez
 * justo sobre esa columna y no puedo confirmar cuál de los dos números es el
 * real sin una foto más clara — por eso no se tocan.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db";
import { cpDetalleFacturas } from "../db/schema";
import { eq } from "drizzle-orm";

async function fijar(id: number, descuento: string | null, subtotal: string) {
  await db.update(cpDetalleFacturas).set({ descuento, subtotal }).where(eq(cpDetalleFacturas.id, id));
}

async function soloSubtotal(id: number, subtotal: string) {
  await db.update(cpDetalleFacturas).set({ subtotal }).where(eq(cpDetalleFacturas.id, id));
}

async function main() {
  // Factura #19 — descuento faltante, subtotal en bruto.
  await fijar(56, "72910.50", "72910.50"); // SW591X6 S/G, 20u, 50%
  await fijar(57, "54682.88", "54682.87"); // SW591X6 C/G, 15u, 50%
  await fijar(58, null, "41813.64"); // CCL 600CC X6, sin descuento
  await fijar(59, "8562.53", "15901.83"); // AQ.POM.S/G, 4u, 35%
  await fijar(60, "58405.92", "87608.88"); // COCA-COLA MED.350x24, 4u, 40%

  // Factura #35 — descuento faltante, subtotal en bruto (id154 CC ZERO ya estaba bien, no se toca).
  await fijar(150, "109365.75", "109365.75"); // SW591X6 S/G (cant 30), 50%
  await fijar(151, "36455.25", "36455.25"); // SW591X6 C/G (cant 10), 50%
  await fijar(152, "2140.63", "3975.46"); // AQ.PERA S/G, 1u, 35%
  await fijar(153, "4281.26", "7950.92"); // AQ.POM.S/G, 2u, 35%

  // Factura #97 — descuento faltante, subtotal en bruto (40%).
  await fijar(390, "14601.60", "21902.40");
  await fijar(391, "146016.00", "219024.00");
  await fijar(392, "14601.60", "21902.40");
  await fijar(393, "30259.20", "45388.80");
  await fijar(394, "30259.20", "45388.80");

  // Factura #77 — descuento YA correcto, solo falta recalcular subtotal.
  await soloSubtotal(330, "72910.00");
  await soloSubtotal(331, "36465.00");
  await soloSubtotal(332, "7953.00");
  await soloSubtotal(333, "7953.00");
  await soloSubtotal(334, "7953.00");
  await soloSubtotal(335, "10630.00");
  await soloSubtotal(336, "21260.00");
  await soloSubtotal(337, "21903.00");
  await soloSubtotal(338, "21903.00");
  await soloSubtotal(339, "22694.00");

  // Factura #132 — descuento YA correcto, solo falta recalcular subtotal (rows 522/523 ya estaban bien).
  await soloSubtotal(524, "3977.00");
  await soloSubtotal(525, "3977.00");
  await soloSubtotal(526, "3977.00");
  await soloSubtotal(527, "43806.00");

  console.log("Listo.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
