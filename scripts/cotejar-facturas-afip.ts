// CLI para cotejar el export "Mis Comprobantes Recibidos" de ARCA/AFIP contra
// cp_facturas. La lógica vive en lib/control-precios/cotejo-afip.ts (compartida
// con la página /control-precios/cotejo-afip) — este script es solo lectura de
// archivo + impresión por consola.
//
// Uso:
//   npx tsx scripts/cotejar-facturas-afip.ts "<ruta al excel de ARCA>" "<nombre o id del local>" [--periodo=AAAA-MM]

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { cotejarComprobantesAfip, parsearExcelAfip, resolverLocal } from "../lib/control-precios/cotejo-afip";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.slice(2).split("=");
        return [k, v ?? "true"];
      })
  );

  const [rutaExcel, localArg] = args;
  if (!rutaExcel || !localArg) {
    console.error(
      'Uso: npx tsx scripts/cotejar-facturas-afip.ts "<ruta al excel de ARCA>" "<nombre o id del local>" [--periodo=AAAA-MM]'
    );
    process.exit(1);
  }

  const { local, locales, coincidencias } = await resolverLocal(localArg);
  if (!local) {
    console.error(
      !coincidencias || coincidencias.length === 0
        ? `No se encontró ningún local que contenga "${localArg}".`
        : `"${localArg}" es ambiguo, coincide con: ${coincidencias.map((l) => l.nombre).join(", ")}`
    );
    console.error(`Locales disponibles: ${locales.map((l) => `${l.id}=${l.nombre}`).join(", ")}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(path.resolve(rutaExcel));
  const comprobantes = await parsearExcelAfip(buffer);
  const resultado = await cotejarComprobantesAfip(comprobantes, local, flags.periodo);

  console.log(`\nLocal: ${resultado.local.nombre} (id ${resultado.local.id})`);
  console.log(`CUIT receptor en el excel: ${resultado.cuitReceptorExcel} — confirmá que corresponde a "${resultado.local.nombre}"`);
  console.log(`Período: ${resultado.periodo}`);
  console.log(
    `Comprobantes en el excel: ${resultado.totalComprobantesExcel}${
      resultado.totalFueraDePeriodo > 0 ? ` (${resultado.totalFueraDePeriodo} fuera del período, ignorados)` : ""
    }`
  );

  if (resultado.proveedoresSinCuit.length > 0) {
    console.log(
      `\n⚠ ${resultado.proveedoresSinCuit.length} proveedor(es) de este local no tienen CUIT cargado en cp_proveedores — nunca se van a poder cruzar automáticamente hasta completarles el CUIT: ${resultado.proveedoresSinCuit.join(", ")}`
    );
  }

  console.log(`\n${"=".repeat(90)}`);
  console.log(
    `RESUMEN: ${resultado.totales.proveedoresConDiferencia} proveedor(es) con diferencias, ${resultado.totales.proveedoresOk} coinciden exacto — ` +
      `${resultado.totales.comprobantesFaltantes} comprobante(s) faltantes por $${resultado.totales.montoFaltante.toFixed(2)}`
  );
  console.log("=".repeat(90));

  for (const f of resultado.filas.filter((f) => f.estado !== "OK")) {
    console.log(`\n[${f.estado}] ${f.nombre} (CUIT ${f.cuit})`);
    console.log(`  AFIP:     ${f.cantAfip} comprobante(s), $${f.montoAfip.toFixed(2)}`);
    console.log(`  Cargado:  ${f.cantCargada} comprobante(s), $${f.montoCargado.toFixed(2)}`);
    if (f.faltantes.length > 0) {
      console.log(`  Facturas de AFIP que no se encontraron entre las cargadas:`);
      for (const x of f.faltantes) console.log(`    - ${x.numero} (${x.fecha}, $${x.importe.toFixed(2)})`);
    }
    if (f.identificadasPorMontoYFecha.length > 0) {
      console.log(`  Identificadas por monto y fecha exactos (sin número de comprobante cargado, se toman como la misma factura):`);
      for (const x of f.identificadasPorMontoYFecha) console.log(`    - ${x.numero} (${x.fecha}, $${x.importe.toFixed(2)})`);
    }
    if (f.cargadasSinMatch.length > 0) {
      console.log(`  Cargadas en el sistema que no aparecen en AFIP este período (revisar fecha/proveedor):`);
      for (const x of f.cargadasSinMatch) console.log(`    - ${x.fecha}, $${x.monto.toFixed(2)}`);
    }
  }

  if (resultado.ajustes.length > 0) {
    console.log(`\n${"-".repeat(90)}`);
    console.log("Notas de Crédito/Débito detectadas en AFIP (informativo, no se cruzan contra cp_facturas):");
    for (const a of resultado.ajustes) console.log(`  ${a.nombre} (CUIT ${a.cuit}): ${a.cantidad} nota(s), $${a.montoTotal.toFixed(2)}`);
  }

  console.log(`\nOK (coinciden exacto): ${resultado.totales.proveedoresOk} proveedor(es)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
