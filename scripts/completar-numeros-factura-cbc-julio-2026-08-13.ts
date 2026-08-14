/**
 * Auditoría de julio 2026 contra el CBC (contabilidad real) para Criollo/HORECA
 * SRL/El Emporio de Lanús, cruzando factura por factura (fecha + monto) en vez de
 * solo el total del mes. Encontró casos donde la factura YA está cargada en
 * cp_facturas pero con numero_factura NULL (probable falla de lectura de la IA
 * sobre la foto) — acá se completa el número solo en los casos donde el monto
 * coincide EXACTO (al centavo) contra el CBC, nunca por aproximación. Los casos
 * con diferencia de centavos, con número ya cargado pero distinto al del CBC, o
 * con una factura del CBC partida en dos, se dejan sin tocar (necesitan la foto
 * original, no se puede resolver solo con estos dos números).
 *
 * No hay facturas "faltantes de cargar" acá — esas se piden a los encargados,
 * no se tocan por script. Este script es solo para las que ya están en el
 * sistema pero mal identificadas.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { sql } from "drizzle-orm";

type Candidato = {
  local: string;
  proveedor: string;
  fecha: string;
  subtotalEsperado: number;
  numeroFactura: string;
};

const CANDIDATOS: Candidato[] = [
  { local: "ENCISO", proveedor: "Distribuidora El Criollo SRL", fecha: "2026-07-14", subtotalEsperado: 237821.59, numeroFactura: "0009-00716814" },
  { local: "MACARONS", proveedor: "Distribuidora El Criollo SRL", fecha: "2026-07-15", subtotalEsperado: 120021.53, numeroFactura: "0009-00717242" },
  { local: "MACARONS", proveedor: "Distribuidora El Criollo SRL", fecha: "2026-07-16", subtotalEsperado: 103718.66, numeroFactura: "0009-00717866" },
  { local: "MACARONS", proveedor: "Distribuidora El Criollo SRL", fecha: "2026-07-20", subtotalEsperado: 24053.19, numeroFactura: "0009-00718960" },
  { local: "ROMA CON AMOR", proveedor: "El Emporio de Lanús S.A.", fecha: "2026-07-14", subtotalEsperado: 172785.6, numeroFactura: "0010-00723499" },
];

const TOLERANCIA = 0.001; // exacto al centavo — no es margen de error, es contra redondeo de punto flotante del propio SUM.

async function main() {
  console.log("Verificando y completando números de factura contra el CBC de julio...\n");
  let actualizadas = 0;

  for (const c of CANDIDATOS) {
    const resultado = await db.execute(sql`
      SELECT f.id, SUM(df.subtotal) AS subtotal
      FROM cp_facturas f
      JOIN cp_detalle_facturas df ON df.factura_id = f.id
      JOIN cp_productos p ON p.id = df.producto_id
      JOIN cp_proveedores prov ON prov.id = p.proveedor_id
      LEFT JOIN alq_locales loc ON loc.id = f.local_id
      WHERE f.estado = 'confirmada'
        AND f.fecha_emision = ${c.fecha}
        AND f.numero_factura IS NULL
        AND loc.nombre = ${c.local}
        AND prov.nombre = ${c.proveedor}
      GROUP BY f.id
    `);

    if (resultado.rows.length === 0) {
      console.log(`✗ ${c.local} / ${c.proveedor} / ${c.fecha}: no encontré ninguna factura sin número que coincida — puede que ya se haya corregido a mano.`);
      continue;
    }
    if (resultado.rows.length > 1) {
      console.log(`✗ ${c.local} / ${c.proveedor} / ${c.fecha}: hay ${resultado.rows.length} facturas sin número ese día — ambigüedad, no toco nada.`);
      continue;
    }

    const fila = resultado.rows[0] as { id: number; subtotal: string };
    const subtotalReal = Number(fila.subtotal);
    if (Math.abs(subtotalReal - c.subtotalEsperado) > TOLERANCIA) {
      console.log(
        `✗ ${c.local} / ${c.proveedor} / ${c.fecha}: el subtotal cargado ($${subtotalReal.toFixed(2)}) ya no coincide exacto con el CBC ($${c.subtotalEsperado.toFixed(2)}) — no toco nada.`
      );
      continue;
    }

    await db.execute(sql`UPDATE cp_facturas SET numero_factura = ${c.numeroFactura} WHERE id = ${fila.id}`);
    console.log(`✓ ${c.local} / ${c.proveedor} / ${c.fecha} (factura #${fila.id}, $${subtotalReal.toFixed(2)}) → numero_factura = "${c.numeroFactura}"`);
    actualizadas++;
  }

  console.log(`\n${actualizadas} de ${CANDIDATOS.length} facturas completadas.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
