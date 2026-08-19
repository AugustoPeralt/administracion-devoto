// Backfill de una sola vez: normaliza cp_proveedores.cuit a solo dígitos para
// todas las filas legacy que quedaron con guiones (datos de antes de que
// buscarOCrearProveedor()/corregirCuitProveedor() empezaran a normalizar al
// escribir — ambas funciones YA guardan solo dígitos desde su creación, así
// que después de este backfill el formato con guiones no debería volver a
// aparecer nunca más: ver conversación 2026-08-19, causa raíz de 20
// proveedores duplicados por comparar CUIT crudo sin normalizar contra CUIT
// normalizado en buscarOCrearProveedor().
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db/index";
import { cpProveedores } from "../db/schema";
import { eq } from "drizzle-orm";

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

async function main() {
  const todos = await db.select().from(cpProveedores);
  let corregidos = 0;
  const conflictos: string[] = [];

  for (const p of todos) {
    if (!p.cuit) continue;
    const normalizado = soloDigitos(p.cuit);
    if (normalizado === p.cuit) continue; // ya estaba bien
    if (normalizado.length !== 11) {
      console.log(`⚠ id=${p.id} nombre="${p.nombre}" cuit="${p.cuit}" no normaliza a 11 dígitos (${normalizado}) — no se toca, revisar a mano`);
      continue;
    }
    try {
      await db.update(cpProveedores).set({ cuit: normalizado }).where(eq(cpProveedores.id, p.id));
      console.log(`id=${p.id} "${p.nombre}": "${p.cuit}" -> "${normalizado}"`);
      corregidos++;
    } catch (err) {
      const cause = err instanceof Error ? (err.cause as { code?: string; constraint?: string } | undefined) : undefined;
      if (cause?.code === "23505" || cause?.constraint === "cp_proveedores_cuit_idx") {
        // Ya existe OTRA fila con este CUIT normalizado bajo un nombre distinto
        // — no es un duplicado de formato, es un CUIT compartido entre dos
        // proveedores con nombre distinto (posible error real de carga en uno
        // de los dos). No se toca automáticamente, queda para revisión humana
        // vía /control-precios/proveedores (agruparPosiblesDuplicados ya lo
        // va a mostrar apenas alguno de los dos quede normalizado).
        conflictos.push(`id=${p.id} "${p.nombre}" (${p.cuit} -> ${normalizado}) choca con otra fila que ya tiene ese CUIT`);
        console.log(`⚠ id=${p.id} "${p.nombre}": "${p.cuit}" -> "${normalizado}" CHOCA con otro proveedor ya existente — no se toca`);
      } else {
        throw err;
      }
    }
  }

  console.log(`\n${corregidos} CUIT(s) normalizados.`);
  if (conflictos.length > 0) {
    console.log(`\n${conflictos.length} conflicto(s) sin resolver (mismo CUIT, nombre distinto — revisar a mano):`);
    for (const c of conflictos) console.log(`  ${c}`);
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
