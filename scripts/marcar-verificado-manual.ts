/**
 * Marca verificado_manual=true en los renglones que quedaron "sin verificar"
 * pero que confirmé a mano el 2026-07-23 que son correctos: en todos estos
 * casos, cantidad×precio_unitario−descuento coincide con subtotal (la fórmula
 * que el sistema siempre aplica), así que el subtotal está bien — lo que pasa
 * es que subtotal_impreso quedó tomado de una columna con impuestos (Quilmes,
 * FEMSA con "IMP.TOTAL"), o directamente no se extrajo (Alto Campo,
 * Frigorífico), así que el chequeo automático nunca iba a poder confirmarlos
 * aunque estén bien. IDs identificados con scripts/_finalizar-sin-verificar.ts
 * (script de investigación, no se conserva).
 *
 * Los 13 renglones de FEMSA (facturas #77 y #132) que SÍ tienen una
 * inconsistencia real (no cumplen ni su propia fórmula) quedan deliberadamente
 * afuera — necesitan que alguien mire el papel original.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db";
import { cpDetalleFacturas } from "../db/schema";
import { inArray } from "drizzle-orm";

const IDS_CONFIRMADOS = [
  329, // Alto Campo SRL
  1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433, // Cervecería Quilmes
  154, 522, 523, 1492, 1493, // Coca-Cola FEMSA (formula consistente, subtotal_impreso = col. con impuestos o ausente)
  273, // FRIGORIFICO HT S.R.L (OSOBUCO)
];

async function main() {
  const resultado = await db
    .update(cpDetalleFacturas)
    .set({ verificadoManual: true })
    .where(inArray(cpDetalleFacturas.id, IDS_CONFIRMADOS))
    .returning({ id: cpDetalleFacturas.id });
  console.log(`Marcados como verificado_manual: ${resultado.length} de ${IDS_CONFIRMADOS.length} esperados`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
