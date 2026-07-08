import { config } from "dotenv";
config({ path: ".env.local" });

import { obtenerSiteId, obtenerDriveIdPrincipal, listarCarpeta } from "../lib/sharepoint";
import { sincronizarDesdeSharePoint } from "../lib/sincronizar-sharepoint";

async function main() {
  if (process.argv.includes("--listar")) {
    await listar();
    return;
  }

  const resultado = await sincronizarDesdeSharePoint({ forzar: process.argv.includes("--forzar") });
  if (resultado.motivo === "sin_cambios") {
    console.log("Ninguno de los dos archivos cambió desde la última sincronización. No se reprocesa.");
  } else {
    console.log(
      `\nSincronización completa: ${resultado.totalMovimientos} movimientos, ${resultado.requierenJustificacion} requieren justificación.`
    );
  }
}

/**
 * Modo diagnóstico: lista el contenido de SHAREPOINT_FOLDER_PATH para confirmar
 * la ruta exacta de los dos Excels antes de fijarla en SHAREPOINT_ARCHIVO_*_PATH.
 * Uso: npx tsx scripts/sync-sharepoint.ts --listar
 */
async function listar() {
  const folderPath = process.env.SHAREPOINT_FOLDER_PATH;
  if (!folderPath) {
    throw new Error("Configurá SHAREPOINT_FOLDER_PATH en .env.local antes de correr --listar.");
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
    `\nUsá el nombre exacto de los dos Excels para completar SHAREPOINT_ARCHIVO_2026_PATH y ` +
      `SHAREPOINT_ARCHIVO_OBRAS_PATH en .env.local (ej. "${folderPath}/CONSOLIDADO 2026.xlsx").`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
