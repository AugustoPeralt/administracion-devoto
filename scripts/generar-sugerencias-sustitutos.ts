/**
 * Genera sugerencias de "producto sustituto más barato" DENTRO del catálogo de
 * un proveedor (ver cp_sustitutos_producto en db/schema.ts) — compara, de a
 * pares, todos los productos vinculados a nuestro catálogo (producto_id no
 * nulo), y sugiere el par cuando son la misma variante de producto con
 * distinta marca (ver sonSustitutosPorMarca() en
 * lib/control-precios/normalizar.ts — exige que TODO el nombre coincida salvo
 * la marca; "Dulce de Leche Repostero Vacalín" sí es sustituto de "... Milkaut",
 * pero NO de "Dulce de Leche Clásico Vacalín": ahí lo que cambia es la
 * variante, no la marca).
 *
 * No pisa nada existente: inserta con ON CONFLICT DO NOTHING, así que correrlo
 * de nuevo después de reimportar una lista solo agrega pares nuevos, nunca
 * duplica ni resucita una sugerencia que ya se descartó a mano (esa fila ya no
 * existe, y este script no vuelve a insertar el mismo par ORDENADO otra vez —
 * ver conflicto por (lista_a_id, lista_b_id) más abajo).
 *
 * Uso: npx tsx scripts/generar-sugerencias-sustitutos.ts <criollo|emporio>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { cpListasPreciosProveedor, cpSustitutosProducto } from "../db/schema";
import { NOMBRE_PROVEEDOR_EL_CRIOLLO } from "../lib/control-precios/constantes";
import { NOMBRE_PROVEEDOR_EL_EMPORIO, buscarProveedorIdPorNombre } from "../lib/control-precios/consultas";
import { sonSustitutosPorMarca } from "../lib/control-precios/normalizar";
import { and, eq, isNotNull } from "drizzle-orm";

async function main() {
  const proveedorArg = process.argv[2];
  const nombreProveedor =
    proveedorArg === "criollo"
      ? NOMBRE_PROVEEDOR_EL_CRIOLLO
      : proveedorArg === "emporio"
        ? NOMBRE_PROVEEDOR_EL_EMPORIO
        : null;
  if (!nombreProveedor) {
    console.error('Uso: npx tsx scripts/generar-sugerencias-sustitutos.ts <criollo|emporio>');
    process.exit(1);
  }

  const proveedorId = await buscarProveedorIdPorNombre(nombreProveedor);
  const filas = await db
    .select({
      id: cpListasPreciosProveedor.id,
      descripcion: cpListasPreciosProveedor.descripcion,
    })
    .from(cpListasPreciosProveedor)
    .where(and(eq(cpListasPreciosProveedor.proveedorId, proveedorId), isNotNull(cpListasPreciosProveedor.productoId)));

  let candidatos = 0;
  const valores: { listaAId: number; listaBId: number; motivo: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    for (let j = i + 1; j < filas.length; j++) {
      const a = filas[i];
      const b = filas[j];
      if (!sonSustitutosPorMarca(a.descripcion, b.descripcion)) continue;

      candidatos++;
      const [listaAId, listaBId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      valores.push({
        listaAId,
        listaBId,
        motivo: `Misma variante, distinta marca: "${a.descripcion}" / "${b.descripcion}"`,
      });
    }
  }

  if (valores.length > 0) {
    await db.insert(cpSustitutosProducto).values(valores).onConflictDoNothing();
  }

  console.log(
    `${nombreProveedor}: ${filas.length} productos vinculados revisados, ${candidatos} candidatos encontrados (insertados si no existían ya — se muestran directo, sin paso de confirmación).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
