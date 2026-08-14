/**
 * Análisis (solo lectura) de las sugerencias de agruparPosiblesProductosDuplicados()
 * para aplicar el criterio pedido por el usuario: si dos productos del mismo
 * proveedor tienen exactamente el mismo conjunto de precios unitarios
 * registrados (facturas confirmadas), son el mismo producto cargado con
 * variantes de nombre. Si los precios no coinciden del todo (o falta data),
 * se deja como duda para revisión manual — no fusiona nada, solo imprime el
 * análisis. La fusión real (si corresponde) se hace aparte con fusionarProductos().
 *
 * Uso: npx tsx scripts/analizar-productos-duplicados-2026-08-14.ts
 */
import { db } from "../db";
import { cpDetalleFacturas, cpFacturas } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  obtenerProductosConTotales,
  agruparPosiblesProductosDuplicados,
  obtenerClavesDuplicadosDescartados,
} from "../lib/control-precios/consultas";

function claveGrupo(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

async function precioSetDeProducto(productoId: number): Promise<{ precios: string[]; registros: number }> {
  const filas = await db
    .select({
      precioUnitario: cpDetalleFacturas.precioUnitario,
      fechaEmision: cpFacturas.fechaEmision,
    })
    .from(cpDetalleFacturas)
    .innerJoin(cpFacturas, eq(cpFacturas.id, cpDetalleFacturas.facturaId))
    .where(and(eq(cpDetalleFacturas.productoId, productoId), eq(cpFacturas.estado, "confirmada")));

  const registros = filas.filter((f) => f.precioUnitario !== null).length;
  const set = new Set(
    filas.filter((f) => f.precioUnitario !== null).map((f) => Number(f.precioUnitario).toFixed(2))
  );
  return { precios: [...set].sort(), registros };
}

async function main() {
  const productos = await obtenerProductosConTotales();
  const gruposDescartados = await obtenerClavesDuplicadosDescartados("producto");
  const grupos = agruparPosiblesProductosDuplicados(productos).filter(
    (g) => !gruposDescartados.has(claveGrupo(g.map((p) => p.id)))
  );

  console.log(`Grupos candidatos (no descartados previamente): ${grupos.length}\n`);

  const confirmar: { proveedor: string; ids: number[]; nombres: string[]; precio: string }[] = [];
  const duda: { proveedor: string; ids: number[]; nombres: string[]; motivo: string; detalle: string }[] = [];

  for (const grupo of grupos) {
    const proveedor = grupo[0].proveedorNombre;
    const nombres = grupo.map((p) => p.nombre);
    const ids = grupo.map((p) => p.id);

    const infos = await Promise.all(grupo.map((p) => precioSetDeProducto(p.id)));

    console.log(`--- Proveedor: ${proveedor} ---`);
    grupo.forEach((p, i) => {
      console.log(
        `  [${p.id}] "${p.nombre}" (${p.unidadMedida}) — ${infos[i].registros} renglones confirmados, precios: ${
          infos[i].precios.length ? infos[i].precios.join(", ") : "(sin precio)"
        }`
      );
    });

    if (infos.some((info) => info.precios.length === 0)) {
      const motivo = "sin precio para comparar en al menos uno de los productos";
      console.log(`  => DUDA: ${motivo}\n`);
      duda.push({ proveedor, ids, nombres, motivo, detalle: infos.map((i) => i.precios.join("/")).join(" vs ") });
      continue;
    }

    const [primero, ...resto] = infos;
    const setPrimero = primero.precios.join(",");
    const todosIguales = resto.every((info) => info.precios.join(",") === setPrimero);

    if (todosIguales) {
      console.log(`  => CONFIRMAR: mismo proveedor + mismos precios (${setPrimero})\n`);
      confirmar.push({ proveedor, ids, nombres, precio: setPrimero });
    } else {
      const motivo = "los conjuntos de precios no coinciden exactamente";
      console.log(`  => DUDA: ${motivo}\n`);
      duda.push({ proveedor, ids, nombres, motivo, detalle: infos.map((i) => i.precios.join("/")).join(" vs ") });
    }
  }

  console.log("\n================ RESUMEN ================");
  console.log(`\nCONFIRMAR (mismo proveedor + mismo precio) — ${confirmar.length} grupo(s):`);
  confirmar.forEach((c) =>
    console.log(`  [${c.ids.join(", ")}] ${c.proveedor}: ${c.nombres.map((n) => `"${n}"`).join(" / ")} — precio ${c.precio}`)
  );

  console.log(`\nDUDA (dejar para revisión manual) — ${duda.length} grupo(s):`);
  duda.forEach((d) =>
    console.log(
      `  [${d.ids.join(", ")}] ${d.proveedor}: ${d.nombres.map((n) => `"${n}"`).join(" / ")} — ${d.motivo} (${d.detalle})`
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
