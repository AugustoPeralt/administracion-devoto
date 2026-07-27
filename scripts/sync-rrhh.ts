import { config } from "dotenv";
config({ path: ".env.local" });

import { obtenerSiteId, obtenerDriveIdPrincipal, listarCarpeta } from "../lib/sharepoint";
import { sincronizarRrhh } from "../lib/rrhh/sincronizar-sharepoint";

async function main() {
  if (process.argv.includes("--listar")) {
    await listar();
    return;
  }

  const dryRun = process.argv.includes("--dry-run");
  const resultado = await sincronizarRrhh({ dryRun });

  console.log(
    `Legajos leídos en Presentismo: ${resultado.legajosLeidos}. ` +
      `Actualizados en Nómina: ${resultado.legajosActualizados}. Sin cambio: ${resultado.legajosSinCambio}.`
  );
  if (resultado.legajosHuerfanos.length > 0) {
    console.log(
      `\nLegajos en Presentismo sin fila en Nómina (${resultado.legajosHuerfanos.length}): ` +
        resultado.legajosHuerfanos.join(", ")
    );
  }
  console.log(
    resultado.dryRun
      ? "\nModo --dry-run: no se escribió nada en SharePoint."
      : `\nExcel de Nómina ${resultado.actualizoNomina ? "actualizado" : "sin cambios (nada para escribir)"}.`
  );
}

/**
 * Modo diagnóstico: lista el contenido de SHAREPOINT_RRHH_FOLDER_PATH para
 * confirmar la ruta exacta de Presentismo y Nómina antes de fijarla en
 * SHAREPOINT_RRHH_PRESENTISMO_PATH / SHAREPOINT_RRHH_NOMINA_PATH.
 * Uso: npx tsx scripts/sync-rrhh.ts --listar
 */
async function listar() {
  const folderPath = process.env.SHAREPOINT_RRHH_FOLDER_PATH;
  if (!folderPath) {
    throw new Error("Configurá SHAREPOINT_RRHH_FOLDER_PATH en .env.local antes de correr --listar.");
  }

  console.log("Resolviendo sitio de SharePoint...");
  const siteId = await obtenerSiteId();
  console.log(`  site id: ${siteId}`);

  const driveId = await obtenerDriveIdPrincipal(siteId);
  console.log(`  drive id: ${driveId}`);

  console.log(`\nContenido de "${folderPath}":`);
  const archivos = await listarCarpeta(driveId, folderPath);
  for (const a of archivos) {
    const tipo = a.esCarpeta ? "carpeta" : "archivo";
    console.log(`  [${tipo}] ${a.nombre}${a.esCarpeta ? "" : ` (${a.tamanoBytes} bytes, modificado ${a.modificado})`}`);
  }
  console.log(
    `\nUsá el nombre exacto de los dos Excels para completar SHAREPOINT_RRHH_PRESENTISMO_PATH y ` +
      `SHAREPOINT_RRHH_NOMINA_PATH en .env.local (ej. "${folderPath}/Presentismo.xlsx").`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
