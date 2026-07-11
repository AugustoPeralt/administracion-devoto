import { config } from "dotenv";
config({ path: ".env.local" });

import { sincronizarAlquileres } from "../lib/alquileres/sincronizar-sharepoint";

/**
 * CLI para disparar la sincronización de Alquileres fuera de la web (mismo
 * patrón que scripts/sync-sharepoint.ts para Consolidados).
 * Uso: npx tsx scripts/sync-sharepoint-alquileres.ts [--forzar]
 */
async function main() {
  const resultado = await sincronizarAlquileres({ forzar: process.argv.includes("--forzar") });

  console.log(
    `CBCs: ${resultado.cbcsEncontrados} encontrados, ${resultado.cbcsProcesados} procesados, ` +
      `${resultado.cbcsSinCambios} sin cambios, ${resultado.cbcsFallidos} fallidos.`
  );
  console.log(`Excel maestro: ${resultado.maestroActualizado ? "actualizado" : "sin cambios"}.`);
  console.log(`Alertas generadas: ${resultado.alertasGeneradas}.`);

  if (resultado.errores.length > 0) {
    console.log("\nErrores:");
    for (const e of resultado.errores) console.log(`  ${e.archivo}: ${e.mensaje}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
