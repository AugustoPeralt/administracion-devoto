/**
 * Para cada proveedor, compara el TOTAL de la factura (monto_total, el que
 * realmente se paga, con IVA) contra lo que "esperaríamos" reconstruyendo desde
 * los renglones (suma de cantidad×precio_unitario−descuento, + IVA si se pudo
 * leer, o comparado contra subtotal_impreso si no). Si monto_total es
 * consistentemente MÁS BAJO que lo esperado en muchas facturas del mismo
 * proveedor, es la firma de un descuento a nivel de TODA la factura que no
 * está reflejado en el precio_unitario de ningún renglón — el mismo patrón
 * que ya sabemos que tiene El Criollo (6% adicional sobre el total con IVA).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { sql } from "drizzle-orm";

type FilaFactura = {
  facturaId: number;
  proveedorNombre: string;
  montoTotal: string;
  sumaSubtotal: string;
  sumaSubtotalImpreso: string | null;
  ivaPromedio: string | null;
  cantidadItems: number;
  itemsConIva: number;
  itemsConSubtotalImpreso: number;
};

async function main() {
  const resultado = await db.execute(sql`
    SELECT
      f.id AS "facturaId",
      prov.nombre AS "proveedorNombre",
      f.monto_total AS "montoTotal",
      SUM(df.subtotal) AS "sumaSubtotal",
      SUM(df.subtotal_impreso) AS "sumaSubtotalImpreso",
      AVG(df.iva_porcentaje) AS "ivaPromedio",
      COUNT(df.id)::int AS "cantidadItems",
      COUNT(df.iva_porcentaje)::int AS "itemsConIva",
      COUNT(df.subtotal_impreso)::int AS "itemsConSubtotalImpreso"
    FROM cp_facturas f
    JOIN cp_proveedores prov ON prov.id = f.proveedor_id
    JOIN cp_detalle_facturas df ON df.factura_id = f.id
    GROUP BY f.id, prov.nombre, f.monto_total
  `);

  const filas = resultado.rows as FilaFactura[];

  type Acumulado = { gaps: number[]; facturas: number; sinDatoSuficiente: number };
  const porProveedor = new Map<string, Acumulado>();

  for (const f of filas) {
    const acc = porProveedor.get(f.proveedorNombre) ?? { gaps: [], facturas: 0, sinDatoSuficiente: 0 };
    porProveedor.set(f.proveedorNombre, acc);
    acc.facturas++;

    const montoTotal = Number(f.montoTotal);
    const sumaSubtotal = Number(f.sumaSubtotal ?? 0);
    let esperado: number | null = null;

    if (f.itemsConIva === f.cantidadItems && f.ivaPromedio !== null) {
      esperado = sumaSubtotal * (1 + Number(f.ivaPromedio) / 100);
    } else if (f.itemsConSubtotalImpreso === f.cantidadItems && f.sumaSubtotalImpreso !== null) {
      esperado = Number(f.sumaSubtotalImpreso);
    }

    if (esperado === null || esperado <= 0) {
      acc.sinDatoSuficiente++;
      continue;
    }

    const gapPorc = ((montoTotal - esperado) / esperado) * 100;
    acc.gaps.push(gapPorc);
  }

  const resumen: {
    proveedor: string;
    facturas: number;
    conDatoSuficiente: number;
    gapPromedio: number;
    gapMediana: number;
    desvio: number;
  }[] = [];

  for (const [proveedor, acc] of porProveedor) {
    if (acc.gaps.length < 3) continue; // muy pocas facturas comparables, no saca conclusión
    const gaps = [...acc.gaps].sort((a, b) => a - b);
    const promedio = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const mediana = gaps[Math.floor(gaps.length / 2)];
    const varianza = gaps.reduce((s, g) => s + (g - promedio) ** 2, 0) / gaps.length;
    resumen.push({
      proveedor,
      facturas: acc.facturas,
      conDatoSuficiente: acc.gaps.length,
      gapPromedio: Math.round(promedio * 100) / 100,
      gapMediana: Math.round(mediana * 100) / 100,
      desvio: Math.round(Math.sqrt(varianza) * 100) / 100,
    });
  }

  resumen.sort((a, b) => a.gapPromedio - b.gapPromedio);

  console.log("Proveedor | facturas | con dato suficiente | gap promedio % | gap mediana % | desvío");
  for (const r of resumen) {
    console.log(
      `${r.proveedor} | ${r.facturas} | ${r.conDatoSuficiente} | ${r.gapPromedio}% | ${r.gapMediana}% | ${r.desvio}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
