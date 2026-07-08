import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { obtenerSiteId, obtenerDriveIdPrincipal, descargarArchivo, obtenerVersiones } from "./sharepoint";
import {
  NOMBRE_ARCHIVO_2026,
  NOMBRE_ARCHIVO_OBRAS,
  parsearArchivos,
  imprimirResumen,
  importarADB,
  type MetaArchivo,
} from "../scripts/importar";

export interface ResultadoSincronizacion {
  actualizado: boolean;
  motivo: "sin_cambios" | "importado";
  totalMovimientos?: number;
  requierenJustificacion?: number;
}

/**
 * Descarga los dos Excels reales desde SharePoint, se salta el reproceso si
 * ninguno cambió desde la última sincronización, y si cambiaron corre el mismo
 * parser de Fase 1 e importa a Neon. Usado tanto por el script de terminal
 * (`scripts/sync-sharepoint.ts`) como por el botón "Actualizar ahora" de la web.
 */
export async function sincronizarDesdeSharePoint(opts?: { forzar?: boolean }): Promise<ResultadoSincronizacion> {
  const rutaArchivo2026 = requerirEnv("SHAREPOINT_ARCHIVO_2026_PATH");
  const rutaArchivoObras = requerirEnv("SHAREPOINT_ARCHIVO_OBRAS_PATH");

  const siteId = await obtenerSiteId();
  const driveId = await obtenerDriveIdPrincipal(siteId);

  const [descarga2026, descargaObras] = await Promise.all([
    descargarArchivo(driveId, rutaArchivo2026),
    descargarArchivo(driveId, rutaArchivoObras),
  ]);

  const hash2026 = hashBuffer(descarga2026.buffer);
  const hashObras = hashBuffer(descargaObras.buffer);

  const [hashPrevio2026, hashPrevioObras] = await Promise.all([
    obtenerUltimoHash(NOMBRE_ARCHIVO_2026),
    obtenerUltimoHash(NOMBRE_ARCHIVO_OBRAS),
  ]);

  if (!opts?.forzar && hash2026 === hashPrevio2026 && hashObras === hashPrevioObras) {
    return { actualizado: false, motivo: "sin_cambios" };
  }

  const [versiones2026, versionesObras] = await Promise.all([
    obtenerVersiones(driveId, descarga2026.itemId),
    obtenerVersiones(driveId, descargaObras.itemId),
  ]);

  // Cast puntual: exceljs trae su propio @types/node embebido, con un `Buffer` de
  // una generación anterior a los tipos genéricos (Buffer<ArrayBufferLike>) que usa
  // el resto del proyecto. El valor en runtime es un Buffer real y válido.
  const wb2026 = new ExcelJS.Workbook();
  await wb2026.xlsx.load(descarga2026.buffer as any);
  const wbObras = new ExcelJS.Workbook();
  await wbObras.xlsx.load(descargaObras.buffer as any);

  const { procesadas, titulares2026, titularesObras, planCuentas } = await parsearArchivos(
    { nombre: NOMBRE_ARCHIVO_2026, workbook: wb2026 },
    { nombre: NOMBRE_ARCHIVO_OBRAS, workbook: wbObras }
  );

  imprimirResumen(procesadas);

  const meta: Record<string, MetaArchivo> = {
    [NOMBRE_ARCHIVO_2026]: {
      hash: hash2026,
      modificadoPorSharepoint: versiones2026[0]?.modificadoPor ?? null,
      fechaModificacionSharepoint: versiones2026[0]?.fecha ?? null,
    },
    [NOMBRE_ARCHIVO_OBRAS]: {
      hash: hashObras,
      modificadoPorSharepoint: versionesObras[0]?.modificadoPor ?? null,
      fechaModificacionSharepoint: versionesObras[0]?.fecha ?? null,
    },
  };

  await importarADB(procesadas, titulares2026, titularesObras, planCuentas, meta);

  const totalMovimientos = procesadas.reduce((acc, p) => acc + p.resultado.movimientos.length, 0);
  const requierenJustificacion = procesadas.reduce(
    (acc, p) => acc + p.resultado.movimientos.filter((m) => m.requiereJustificacion).length,
    0
  );

  return { actualizado: true, motivo: "importado", totalMovimientos, requierenJustificacion };
}

async function obtenerUltimoHash(archivo: string): Promise<string | null> {
  const { db } = await import("../db");
  const result: any = await db.execute(
    sql`select hash_archivo from registro_auditoria where archivo = ${archivo} and accion_tomada = 'importado' order by fecha_carga desc limit 1`
  );
  const rows = Array.isArray(result) ? result : result.rows;
  return rows[0]?.hash_archivo ?? null;
}

function hashBuffer(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} en .env.local.`);
  return valor;
}
