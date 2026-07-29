/**
 * Limpieza de duplicados de FEMSA detectados al revisar el lote de facturas del
 * 2026-07-29 (ver scripts/corregir-femsa-2026-07-29.ts para la corrección de
 * precios de ese mismo lote — esto es un problema aparte, de catálogo).
 *
 * PROVEEDORES DUPLICADOS: existían 3 filas en cp_proveedores con el mismo
 * nombre "Coca-Cola FEMSA de Buenos Aires S.A." (ids 24, 77, 88). El 24 es el
 * real (CUIT 30-52539008-6, el que imprime FEMSA en todas sus facturas como
 * emisor). Los ids 77 y 88 se crearon hoy (2026-07-29) porque buscarOCrearProveedor
 * (actions.ts) terminó usando el CUIT del CLIENTE (el restaurante que compra,
 * impreso en el recuadro "CLIENTE:...") en vez del CUIT del emisor — confirmado
 * comparando: el cuit guardado en la fila 77 (30715696602) es el de MERCEDES 3939
 * SRL/MECHA (factura #417), y el de la fila 88 (30-71419216-3) es el de MLCD
 * (facturas #476/#477/#489). Esto no es "el mismo producto pero de otro
 * restaurante" — cp_productos nunca tuvo columna de restaurante, se scopea solo
 * por proveedor_id — es un proveedor fantasma creado por leer mal un CUIT.
 *
 * PRODUCTOS DUPLICADOS: la mayoría son consecuencia directa de lo anterior (el
 * mismo producto, con el nombre idéntico, catalogado bajo el proveedor_id
 * fantasma en vez del real — fusionarProveedoresInterno los fusiona solo si el
 * nombre es idéntico). El resto son typos de OCR del mismo texto impreso
 * "SW591X6 S/G (6P)" / "SW591X6 C/G (6P)" (confirmado contra la foto de cada
 * factura: mismo código de producto FEMSA — 84819 y 84820 respectivamente — en
 * todos los casos), más 3 duplicados preexistentes de puntuación/espacios sin
 * relación con el bug de hoy (COCA-COLA MED, AQ.PERA, SPRITE ZERO).
 *
 * Probado antes en una transacción con ROLLBACK (mismo patrón que
 * scripts/probar-fusion-proveedores.ts): de 39 productos fragmentados en 3
 * proveedores quedan 19 productos limpios bajo el proveedor único.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { fusionarProveedoresInterno, fusionarProductosInterno } from "../app/control-precios/actions";

async function main() {
  // Fase 1: unificar los 3 proveedores en el real (id 24).
  await fusionarProveedoresInterno(24, 77);
  await fusionarProveedoresInterno(24, 88);

  // Fase 2: typos de OCR del mismo producto (mismo código FEMSA confirmado en la foto).
  await fusionarProductosInterno(52, 796); // SW591X6 S/G (6P) <- SM591X6 S/G (6P)
  await fusionarProductosInterno(52, 878); // SW591X6 S/G (6P) <- SW591X6 S/C (6P)
  await fusionarProductosInterno(132, 879); // SW591X6 C/G (6P) <- SW591X6 C/C (6P)
  await fusionarProductosInterno(132, 133); // SW591X6 C/G (6P) <- SW91X6 C/G (6P)
  await fusionarProductosInterno(52, 836); // SW591X6 S/G (6P) <- SWS91X6 S/G (6P)
  await fusionarProductosInterno(132, 837); // SW591X6 C/G (6P) <- SW591XC-MC (6P)
  await fusionarProductosInterno(310, 972); // FANTA NAR. MED 350CC X 24 <- FANTA NAR.MED 350CC x 24

  // Fase 3: duplicados preexistentes de puntuación/espacios, sin relación con el bug de hoy.
  await fusionarProductosInterno(56, 255); // COCA-COLA MED.350 X 24 <- COCA-COLA MED 350 X 24
  await fusionarProductosInterno(394, 263); // AQ. PERA S/G 600X6 <- AQ.PERA S/G 600X6
  await fusionarProductosInterno(126, 786); // SPRITE ZERO 350 X 24 <- SPRITE ZERO 350 X 24.
  await fusionarProductosInterno(126, 313); // SPRITE ZERO 350 X 24 <- SPRITE ZERO.350 X 24.

  console.log("Listo.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
