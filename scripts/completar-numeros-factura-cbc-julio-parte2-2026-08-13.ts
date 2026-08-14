/**
 * Continuación de completar-numeros-factura-cbc-julio-2026-08-13.ts: esa primera
 * pasada solo tocó los casos que matcheaban EXACTO al centavo contra el CBC.
 * El usuario confirmó (2026-08-13) que las diferencias de 1-3 centavos entre nuestro
 * SUM(subtotal) y el subtotal del CBC no importan (redondeo esperable al sumar
 * renglones) — esta pasada completa esos números con una tolerancia de $0,10.
 *
 * Caso ROMA CON AMOR / El Emporio de Lanús, 17/07: el diff anterior las había
 * reportado como "una sola factura de $469.909,04" — error del propio diff, que
 * agrupaba por numero_factura y SQL trata todos los NULL como el mismo grupo.
 * En realidad son DOS facturas separadas (id 78 y 79) que matchean exacto al
 * centavo cada una contra su factura del CBC (Nº0010-00724173 $75.823,34 y
 * Nº0010-00724010 $394.085,70) — completadas una por una, sin combinar nada.
 *
 * Los dos casos de ENCISO/HORECA SRL (07/07 y 10/07) donde la factura YA tiene un
 * número cargado que no coincide con el del CBC (mismo monto, número distinto —
 * probable error de tipeo de un lado u otro) NO se tocan: no hay forma de saber
 * cuál de los dos números es el correcto sin la foto, y el usuario pidió
 * únicamente "aceptarlos" (dejar de marcarlos como pendientes), no sobreescribir
 * un dato ya cargado a ciegas.
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
  { local: "ENCISO", proveedor: "HORECA SRL", fecha: "2026-07-14", subtotalEsperado: 718253.02, numeroFactura: "0009-00225262" },
  { local: "MACARONS", proveedor: "HORECA SRL", fecha: "2026-07-15", subtotalEsperado: 230711.22, numeroFactura: "0009-00225606" },
  { local: "MACARONS", proveedor: "HORECA SRL", fecha: "2026-07-16", subtotalEsperado: 207403.28, numeroFactura: "0009-00226027" },
  { local: "MACARONS", proveedor: "HORECA SRL", fecha: "2026-07-20", subtotalEsperado: 317619.94, numeroFactura: "0009-00226946" },
  { local: "ROMA CON AMOR", proveedor: "El Emporio de Lanús S.A.", fecha: "2026-07-17", subtotalEsperado: 75823.34, numeroFactura: "0010-00724173" },
  { local: "ROMA CON AMOR", proveedor: "El Emporio de Lanús S.A.", fecha: "2026-07-17", subtotalEsperado: 394085.7, numeroFactura: "0010-00724010" },
];

const TOLERANCIA = 0.1; // hasta 10 centavos — cubre el redondeo real encontrado (1 a 3 centavos), no una diferencia de negocio.

async function main() {
  console.log("Completando números de factura con tolerancia de redondeo (±$0,10)...\n");
  let actualizadas = 0;

  for (const c of CANDIDATOS) {
    // Filtra también por monto (con la misma tolerancia), no solo por fecha —
    // Roma con Amor/Emporio tiene DOS facturas sin número el mismo día
    // (17/07), así que "misma fecha" solo no alcanza para identificar cuál es
    // cuál.
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
      HAVING ABS(SUM(df.subtotal) - ${c.subtotalEsperado}) <= ${TOLERANCIA}
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
        `✗ ${c.local} / ${c.proveedor} / ${c.fecha}: el subtotal cargado ($${subtotalReal.toFixed(2)}) difiere de más del CBC ($${c.subtotalEsperado.toFixed(2)}) — no toco nada.`
      );
      continue;
    }

    await db.execute(sql`UPDATE cp_facturas SET numero_factura = ${c.numeroFactura} WHERE id = ${fila.id}`);
    console.log(`✓ ${c.local} / ${c.proveedor} / ${c.fecha} (factura #${fila.id}, $${subtotalReal.toFixed(2)}) → numero_factura = "${c.numeroFactura}"`);
    actualizadas++;
  }

  console.log(`\n${actualizadas} de ${CANDIDATOS.length} facturas completadas.`);
  console.log(
    "\nAceptados sin cambios (número ya cargado, distinto al del CBC, mismo monto — no se sobreescribe sin la foto):\n" +
      "  - ENCISO / HORECA SRL / 07/07/2026 (sistema: Nº0009-00223312, CBC: Nº0009-00022312)\n" +
      "  - ENCISO / HORECA SRL / 10/07/2026 (sistema: Nº0009-00224180, CBC: Nº0009-00224189)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
