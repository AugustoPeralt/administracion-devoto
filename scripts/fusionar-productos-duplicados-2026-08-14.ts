/**
 * Ejecuta las fusiones confirmadas por scripts/analizar-productos-duplicados-2026-08-14.ts:
 * grupos de productos del mismo proveedor con exactamente el mismo conjunto de
 * precios unitarios en sus facturas confirmadas (mismo criterio pedido por el
 * usuario 2026-08-14). Excluye a propósito 4 grupos de FRIGORIFICO HT S.R.L.
 * (CHORIZO/CHORIZO COLORADO, CHURRASCO/CHURRASCO CERDO, PULPA/PULPA PALETA,
 * R. BEEF/R. BEEF PICADO) que pasaron el filtro de precio pero son cortes o
 * variantes que podrían ser productos realmente distintos — quedan para
 * revisión manual del usuario.
 *
 * El canónico de cada grupo es el producto con más renglones de factura
 * confirmados (el de más historial real); en empate, el de id más bajo.
 *
 * Uso: npx tsx scripts/fusionar-productos-duplicados-2026-08-14.ts
 */
import { db } from "../db";
import { fusionarProductosInterno } from "../app/control-precios/actions";

// [canonicoId, duplicadoId, descripcion]
const FUSIONES: [number, number, string][] = [
  [949, 410, 'Alyser — LECHE LARGA VIDA ENTERA MILKAUT'],
  [1039, 1553, 'FEMSA — SW591X6 S/G (6F)'],
  [1040, 1554, 'FEMSA — SW591X6 C/G (6F)'],
  [110, 1000, 'Argentum — DETERGENTE (1/2)'],
  [110, 780, 'Argentum — DETERGENTE (2/2)'],
  [1073, 108, 'Argentum — LAVANDINA'],
  [666, 173, 'Argentum — ROLLO ARRANQUE 60X90'],
  [508, 1547, 'El Criollo — AVELLANAS IMPORTADAS 13/15 X 1 KG'],
  [742, 788, 'El Criollo — CAFE EN GRANO TIERRA INTENSO X 1 KG ITALIA'],
  [584, 1300, 'El Criollo — CHIMICHURRI EL CRIOLLO X 1KG'],
  [325, 721, 'El Criollo — CHOCOLATE FENIX AMARGO LACTEADO 86 X 2,5 KG'],
  [154, 655, 'El Criollo — FIDEOS LINGUINE LA MOLISANA X 500GRS'],
  [551, 1303, 'El Criollo — FIDEOS SPAGHETTI LA MOLISANA X 500 GRS'],
  [20, 1546, 'El Criollo — TOMATE PERITA ITALIANO LA BIANCA X 2.55 KG (1/2)'],
  [20, 741, 'El Criollo — TOMATE PERITA ITALIANO LA BIANCA X 2.55 KG (2/2)'],
  [474, 687, 'El Criollo — TOMATE PERITA ITALIANO LA BIANCA X 400 GRS'],
  [225, 1248, 'Don Barrio microgreens — ALBAHACA'],
  [224, 1290, 'Don Barrio microgreens — BROTES'],
  [16, 1138, 'Frigorifico HT — OSOBUCO'],
  [141, 214, 'Granja Martin — Suprema 1ra marca Fresca'],
  [164, 1081, 'Limpieya — Detergente Estilo Cierto 5L'],
  [166, 1083, 'Limpieya — Desodorante para pisos S/R 5L'],
  [165, 1082, 'Limpieya — Lavandina Concentrada 5L'],
  [167, 1084, 'Limpieya — Desengrasante Comaak 5L'],
  [646, 1088, 'Limpieya — Trapo de piso Blanco-gris'],
  [1031, 1085, 'Limpieya — Bolsas Consorcio Negras'],
  [647, 1086, 'Limpieya — Bolsas Consorcio Verdes'],
  [227, 881, 'La Serenisima — LECHE LS UAT ENTERA FORT 3% EDGE 1LT'],
  [226, 882, 'La Serenisima — LECHE LS UAT PARC.DESC FORT 1% EDGE 1L'],
  [978, 387, 'La Serenisima — LECHE LS ULTRA PARC DESC 1% FORT SACH 1L (1/2)'],
  [978, 309, 'La Serenisima — LECHE LS ULTRA PARC DESC 1% FORT SACH 1L (2/2)'],
  [11, 1113, 'Lustrol — REJILLA ART. 101 32X50 APROX. (coma)'],
  [433, 1391, 'Lustrol — REJILLA ART.101 32X50 APROX (punto final)'],
];

async function main() {
  console.log(`Ejecutando ${FUSIONES.length} fusiones (script re-ejecutable: si un producto duplicado ya fue fusionado en una corrida anterior, se saltea)...\n`);
  for (const [canonicoId, duplicadoId, descripcion] of FUSIONES) {
    try {
      await fusionarProductosInterno(canonicoId, duplicadoId, db);
      console.log(`OK      [${canonicoId} <- ${duplicadoId}] ${descripcion}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("No se encontró el producto duplicado")) {
        console.log(`SALTEADO [${canonicoId} <- ${duplicadoId}] ${descripcion} — ya estaba fusionado`);
      } else {
        throw e;
      }
    }
  }
  console.log("\nListo.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
