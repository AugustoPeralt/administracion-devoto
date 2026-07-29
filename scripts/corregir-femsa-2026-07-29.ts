/**
 * Corrección de FEMSA — lote cargado el 2026-07-29 (facturas #382, #390, #417,
 * #430, #476, #489), revisado contra la foto original de cada comprobante.
 * El administrador que cargó este lote no revisó bien contra la foto (mismo
 * proveedor que ya había dado problemas el 2026-07-24, ver
 * scripts/corregir-femsa-parcial.ts) y quedaron precios con diferencias de
 * 50% o más en los reportes.
 *
 * BUG (variante nueva del mismo problema de siempre con el layout de FEMSA:
 * P.UNITARIO | PRECIO NETO | DESCUENTO | SUBTOTAL neto | IVA | I.INTERNOS |
 * SUBTOTAL bruto): la IA nunca completó el campo `descuento` (quedó null) y,
 * en vez de eso, mezcló el descuento dentro de otros campos de formas
 * distintas según la factura:
 *
 * - #382, #390: `precio_unitario` quedó con el precio YA neto de descuento
 *   (precio impreso ÷ ~ (1 − %desc)) en vez del P.UNITARIO impreso (precio de
 *   lista). `subtotal` da bien de casualidad (cantidad × ese precio ya
 *   descontado = cantidad × P.UNITARIO real − descuento), pero al comparar
 *   precio_unitario en el tiempo (obtenerDeltaPrecios usa este campo
 *   directo) se ve una caída falsa de 35-50%.
 * - #417, #430 (renglones con cantidad > 1): más grave — `precio_unitario`
 *   quedó con el SUBTOTAL de la línea (o el neto sin descontar), y `subtotal`
 *   terminó siendo cantidad × ese valor mal puesto: 2x a 20x el valor real.
 * - #489 (factura de otro layout, Quilmes/Andes): `precio_unitario` quedó con
 *   la columna "PREC.UNI.FINAL" (precio final con impuestos prorrateado) en
 *   vez de "PRECIO UNI" (precio de lista), mismo efecto en `subtotal`.
 * - En casi todos los renglones tocados, además, `subtotal_impreso` quedó
 *   con el valor de la columna SUBTOTAL neta (o directamente corrupto) en
 *   vez de la columna bruta (con IVA + Impuestos Internos) que es la que le
 *   corresponde por convención (ver cp_detalle_facturas en db/schema.ts).
 *
 * Factura #477 (mismo cliente MLCD, mismo día) se revisó también y estaba
 * bien en su totalidad (la única fila con $1 de diferencia en subtotal_impreso
 * cae dentro de TOLERANCIA_SUBTOTAL) — no se toca.
 *
 * Todos los valores de este script salen de comparar renglón por renglón
 * contra la foto del comprobante (descargada de R2), verificando la
 * aritmética impresa (PRECIO NETO = cantidad × P.UNITARIO; SUBTOTAL neto =
 * NETO − DESCUENTO) antes de escribir cada corrección. No se tocó ningún
 * renglón cuya foto no permitiera confirmar el número con certeza.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db";
import { cpDetalleFacturas } from "../db/schema";
import { eq } from "drizzle-orm";

type Fix = {
  id: number;
  precioUnitario?: string;
  descuento?: string;
  subtotal?: string;
  subtotalImpreso?: string;
};

async function aplicar(fix: Fix) {
  const { id, ...cambios } = fix;
  const filas = await db
    .update(cpDetalleFacturas)
    .set(cambios)
    .where(eq(cpDetalleFacturas.id, id))
    .returning({ id: cpDetalleFacturas.id });
  if (filas.length !== 1) throw new Error(`Esperaba actualizar 1 fila para detalle #${id}, actualicé ${filas.length}`);
}

async function main() {
  const fixes: Fix[] = [
    // Factura #382 (PIANTE, 24/07) — precio_unitario traía el neto de descuento, descuento nunca se cargó.
    // subtotal y subtotal_impreso ya estaban bien, no se tocan.
    { id: 2375, precioUnitario: "7429.58", descuento: "74295.80" },
    { id: 2376, precioUnitario: "7429.58", descuento: "37147.90" },
    { id: 2377, precioUnitario: "6232.30", descuento: "2181.31" },
    { id: 2378, precioUnitario: "6232.30", descuento: "2181.31" },
    { id: 2379, precioUnitario: "6232.30", descuento: "6543.92" },
    { id: 2380, precioUnitario: "37197.28", descuento: "29757.82" },
    { id: 2381, precioUnitario: "38543.21", descuento: "30834.57" },
    { id: 2382, precioUnitario: "38196.14", descuento: "15278.46" },

    // Factura #390 (PIANTE, 28/07) — mismo bug de precio_unitario/descuento, y acá
    // además subtotal_impreso quedó con el valor neto en vez del bruto en TODAS las filas.
    { id: 2402, precioUnitario: "7429.58", descuento: "37147.90", subtotalImpreso: "46496.91" },
    { id: 2403, precioUnitario: "6232.30", descuento: "2181.31", subtotalImpreso: "5070.50" },
    { id: 2404, precioUnitario: "6232.30", descuento: "2181.31", subtotalImpreso: "5070.50" },
    { id: 2405, subtotalImpreso: "27115.78" }, // sin descuento, precio_unitario/subtotal ya correctos
    { id: 2406, precioUnitario: "37197.28", descuento: "29757.82", subtotalImpreso: "57892.07" },
    { id: 2407, precioUnitario: "37197.28", descuento: "29757.82", subtotalImpreso: "57892.07" },

    // Factura #417 (MECHA, 28/07) — la más grave: subtotal quedó SIN restar el
    // descuento (cantidad × precio_unitario, sin más) en las 7 filas.
    { id: 2561, precioUnitario: "7429.58", descuento: "705810.10", subtotal: "705810.10", subtotalImpreso: "883441.33" },
    { id: 2562, precioUnitario: "7429.58", descuento: "260035.30", subtotal: "260035.30", subtotalImpreso: "325478.38" },
    { id: 2563, precioUnitario: "28544.01", descuento: "22835.21", subtotal: "91340.83", subtotalImpreso: "118465.40" },
    { id: 2564, precioUnitario: "37197.28", descuento: "208304.77", subtotal: "312457.15", subtotalImpreso: "405244.42" },
    { id: 2565, precioUnitario: "37197.28", descuento: "44636.74", subtotal: "66955.10", subtotalImpreso: "86338.09" },
    { id: 2566, precioUnitario: "37197.28", descuento: "208304.77", subtotal: "312457.15", subtotalImpreso: "405244.42" },
    { id: 2567, precioUnitario: "38196.14", descuento: "15278.46", subtotal: "22917.68", subtotalImpreso: "28685.37" },

    // Factura #430 (ROMA CON AMOR, 22/07) — en las dos filas de cantidad > 1,
    // precio_unitario quedó con el SUBTOTAL de línea (10x-20x el precio real).
    { id: 2641, precioUnitario: "7291.05", descuento: "72910.50", subtotal: "72910.50" },
    { id: 2642, precioUnitario: "7291.05", descuento: "36455.25", subtotal: "36455.25" },
    { id: 2643, precioUnitario: "37824.54", descuento: "15129.82" }, // cantidad 1: subtotal ya daba bien de casualidad
    { id: 2644, precioUnitario: "37824.54", descuento: "15129.82" },

    // Factura #476 (MLCD, 24/07) — precio_unitario, descuento y subtotal ya estaban
    // bien; solo subtotal_impreso quedó con el neto en vez del bruto.
    { id: 2858, subtotalImpreso: "28946.04" },
    { id: 2859, subtotalImpreso: "28946.04" },

    // Factura #489 (MLCD, 28/07, layout Quilmes/Andes) — precio_unitario quedó con
    // "PREC.UNI.FINAL" (precio final con impuestos) en vez de "PRECIO UNI" (lista).
    { id: 2915, precioUnitario: "53017.97", descuento: "3959647.23", subtotal: "3993048.56", subtotalImpreso: "5481619.92" },
  ];

  for (const fix of fixes) {
    await aplicar(fix);
  }
  console.log(`Listo. ${fixes.length} renglones corregidos.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
