/**
 * Prueba end-to-end del reporte de delta de precios SIN dejar nada guardado:
 * agarra un producto ya confirmado de verdad, inserta una factura de prueba con un
 * precio más alto en una transacción, corre la misma obtenerDeltaPrecios() que usa
 * la página real, imprime el resultado, y hace ROLLBACK.
 *
 * Uso: npx tsx scripts/probar-delta-precios.ts "<parte del nombre del producto>" <precioNuevo> [diasDespues=1]
 * Ej:  npx tsx scripts/probar-delta-precios.ts "medialuna" 1500 3
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, ilike } from "drizzle-orm";
import * as schema from "../db/schema";
import { obtenerDeltaPrecios } from "../lib/control-precios/consultas";

class RollbackIntencional extends Error {}

function fechaAISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const nombreBuscado = process.argv[2];
  const precioNuevo = Number(process.argv[3]);
  const diasDespues = Number(process.argv[4] ?? 1);

  if (!nombreBuscado || !Number.isFinite(precioNuevo)) {
    console.error(
      'Uso: npx tsx scripts/probar-delta-precios.ts "<parte del nombre del producto>" <precioNuevo> [diasDespues=1]'
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      const [detalleExistente] = await tx
        .select({
          productoId: schema.cpDetalleFacturas.productoId,
          cantidad: schema.cpDetalleFacturas.cantidad,
          facturaId: schema.cpDetalleFacturas.facturaId,
        })
        .from(schema.cpDetalleFacturas)
        .innerJoin(schema.cpProductos, eq(schema.cpProductos.id, schema.cpDetalleFacturas.productoId))
        .where(ilike(schema.cpProductos.nombre, `%${nombreBuscado}%`))
        .limit(1);

      if (!detalleExistente) {
        console.log(`No se encontró ningún producto confirmado que matchee "${nombreBuscado}".`);
        throw new RollbackIntencional();
      }

      const [producto] = await tx
        .select()
        .from(schema.cpProductos)
        .where(eq(schema.cpProductos.id, detalleExistente.productoId))
        .limit(1);
      const [facturaOriginal] = await tx
        .select()
        .from(schema.cpFacturas)
        .where(eq(schema.cpFacturas.id, detalleExistente.facturaId))
        .limit(1);

      const fechaNuevaISO = fechaAISO(
        new Date(new Date(facturaOriginal.fechaEmision).getTime() + diasDespues * 86_400_000)
      );
      const cantidad = Number(detalleExistente.cantidad);
      const montoTotal = (precioNuevo * cantidad).toFixed(2);

      console.log(
        `\nProducto real encontrado: "${producto.nombre}" (proveedor_id=${producto.proveedorId}).`
      );
      console.log(
        `Simulando una 2da factura: precio $${precioNuevo} el ${fechaNuevaISO} ` +
          `(local_id=${facturaOriginal.localId ?? "sin asignar"}), dentro de una transacción que se revierte.\n`
      );

      const [facturaFalsa] = await tx
        .insert(schema.cpFacturas)
        .values({
          proveedorId: producto.proveedorId,
          localId: facturaOriginal.localId,
          fechaEmision: fechaNuevaISO,
          montoTotal,
          archivoUrl: null,
          estado: "confirmada",
        })
        .returning({ id: schema.cpFacturas.id });

      await tx.insert(schema.cpDetalleFacturas).values({
        facturaId: facturaFalsa.id,
        productoId: producto.id,
        cantidad: detalleExistente.cantidad,
        precioUnitario: precioNuevo.toFixed(2),
        subtotal: montoTotal,
        precioOrigen: "manual",
      });

      const resultado = await obtenerDeltaPrecios(
        { desde: facturaOriginal.fechaEmision, hasta: fechaNuevaISO },
        tx
      );
      const fila = resultado.find((r) => r.productoId === producto.id);

      console.log("Resultado de obtenerDeltaPrecios() — la misma función que usa /control-precios/reportes:");
      console.log(fila ?? "(no apareció ninguna fila para este producto — revisar el rango de fechas)");

      throw new RollbackIntencional();
    });
  } catch (error) {
    if (!(error instanceof RollbackIntencional)) throw error;
    console.log("\n✅ ROLLBACK aplicado — no quedó nada guardado en la base real.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
