import { config } from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  NOMBRE_ARCHIVO_2026,
  NOMBRE_ARCHIVO_OBRAS,
  parsearArchivos,
  imprimirResumen,
  importarADB,
  type MetaArchivo,
} from "./importar";

config({ path: ".env.local" });

const ARCHIVOS_DIR = path.join(import.meta.dirname, "..", "archivosCopiaDeConsolidados");
const ARCHIVO_2026 = { nombre: NOMBRE_ARCHIVO_2026, path: path.join(ARCHIVOS_DIR, "CONSOLIDADO 2026.xlsx") };
const ARCHIVO_OBRAS = { nombre: NOMBRE_ARCHIVO_OBRAS, path: path.join(ARCHIVOS_DIR, "CONSOLIDADO OBRAS.xlsx") };

const dryRunForzado = process.argv.includes("--dry-run");
const dbUrlConfigurado = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("PEGA_ACA");
const modoDryRun = dryRunForzado || !dbUrlConfigurado;

async function main() {
  console.log(`Modo: ${modoDryRun ? "DRY-RUN (no se escribe en la base de datos)" : "IMPORTACION REAL a Neon"}`);
  if (dryRunForzado) console.log("  (forzado con --dry-run)");
  else if (!dbUrlConfigurado) console.log("  (DATABASE_URL no configurado en .env.local todavia)");
  console.log("");

  const wb2026 = await cargarWorkbook(ARCHIVO_2026.path);
  const wbObras = await cargarWorkbook(ARCHIVO_OBRAS.path);

  const { procesadas, titulares2026, titularesObras, planCuentas } = await parsearArchivos(
    { nombre: ARCHIVO_2026.nombre, workbook: wb2026 },
    { nombre: ARCHIVO_OBRAS.nombre, workbook: wbObras }
  );

  console.log(
    `Catalogos: ${titulares2026.length} titulares (2026), ${titularesObras.length} titulares (OBRAS), ${planCuentas.length} cuentas (Plan de Cuentas)\n`
  );

  imprimirResumen(procesadas);

  if (modoDryRun) {
    console.log("\nDry-run completo. Configura DATABASE_URL en .env.local y corre sin --dry-run para importar a Neon.");
    return;
  }

  const meta: Record<string, MetaArchivo> = {
    [ARCHIVO_2026.nombre]: { hash: hashDeArchivo(ARCHIVO_2026.path) },
    [ARCHIVO_OBRAS.nombre]: { hash: hashDeArchivo(ARCHIVO_OBRAS.path) },
  };

  await importarADB(procesadas, titulares2026, titularesObras, planCuentas, meta);
}

async function cargarWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontro el archivo: ${filePath}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return wb;
}

function hashDeArchivo(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
