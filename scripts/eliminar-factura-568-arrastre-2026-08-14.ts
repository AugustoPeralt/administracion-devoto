/**
 * Factura #568 (Distribuidora El Criollo SRL, local MECHA, 04/08/2026,
 * Nº0008-00025288, confirmada) tiene renglones con la cantidad mal leída por
 * la IA — al menos 7 productos con cantidad×precio_unitario que no reconcilia
 * contra subtotal_impreso por un factor entero (2x, 5x, 12x: CARAMELO LIQUIDO
 * JORGITO, CASTAÑAS DE CAJU, DULCE DE LECHE MILKAUT, EDULCORANTE LAVAZZA,
 * MAYONESA HELLMANN'S, PULPALIST CRISTAL, SALSA DEMIGLACE KNORR), más dos
 * renglones agregados a mano ("TETRA BRICK BLANCO/TINTO") cuya relación con
 * Pulpalist/Salsa Demiglace no se pudo confirmar sin ver el papel en persona.
 * Ya se había excluido del todo a esta factura de la alerta de comparación
 * entre restaurantes (ver comentario en obtenerComparacionEntreRestaurantes,
 * lib/control-precios/consultas.ts) para que no siga generando alertas falsas
 * de +200% a +1400%.
 *
 * Decisión del usuario (2026-08-14): en vez de reconstruir los valores
 * correctos a partir de una foto de baja resolución, borrar la factura entera
 * y volver a cargarla desde cero — la lectura de la IA ya mejoró desde
 * agosto. Se verificó antes de borrar que no hay ninguna fila en
 * cp_comparaciones_restaurantes_revisadas ni en cp_facturas_repetidas_revisadas
 * que referencie esta factura (no hay riesgo de romper un FK ni de dejar una
 * resolución archivada apuntando a datos borrados).
 *
 * cp_detalle_facturas.factura_id tiene ON DELETE CASCADE sobre cp_facturas,
 * así que borrar la factura se lleva sus 26 renglones de detalle solos — no
 * hace falta un DELETE aparte. El archivo original (archivo_url, en R2) NO se
 * borra acá: queda huérfano en el bucket, sin costo relevante, por si hace
 * falta volver a mirarlo.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { sql } from "drizzle-orm";

const FACTURA_ID = 568;

async function main() {
  const factura = await db.execute(sql`SELECT * FROM cp_facturas WHERE id = ${FACTURA_ID}`);
  if (factura.rows.length === 0) {
    console.log(`No existe la factura #${FACTURA_ID} — puede que ya se haya borrado.`);
    return;
  }
  console.log("Factura a borrar:", factura.rows[0]);

  const detalle = await db.execute(sql`
    SELECT df.id, df.producto_id, p.nombre AS producto, df.cantidad, df.precio_unitario, df.subtotal, df.subtotal_impreso
    FROM cp_detalle_facturas df
    JOIN cp_productos p ON p.id = df.producto_id
    WHERE df.factura_id = ${FACTURA_ID}
    ORDER BY df.id
  `);
  console.log(`\nRenglones que se van a borrar en cascada (${detalle.rows.length}):`);
  for (const r of detalle.rows as any[]) {
    console.log(`  #${r.id} ${r.producto} | cant=${r.cantidad} | precio=${r.precio_unitario} | subtotal=${r.subtotal} | impreso=${r.subtotal_impreso}`);
  }

  const borrada = await db.execute(sql`DELETE FROM cp_facturas WHERE id = ${FACTURA_ID} RETURNING id`);
  console.log(`\nBorrada: ${JSON.stringify(borrada.rows)}`);

  const verificacion = await db.execute(sql`SELECT COUNT(*) AS n FROM cp_detalle_facturas WHERE factura_id = ${FACTURA_ID}`);
  console.log("Renglones de detalle restantes (debe ser 0):", verificacion.rows);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
