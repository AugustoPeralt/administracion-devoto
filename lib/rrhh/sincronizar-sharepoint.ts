import ExcelJS from "exceljs";
import { obtenerSiteId, obtenerDriveIdPrincipal, descargarArchivo, subirArchivo } from "../sharepoint";
import { hoyART, isoDeFecha, mismaFechaUTC } from "./fechas";
import type { RegistroPresentismo, ResultadoSincronizacionRrhh } from "./tipos";

/**
 * Sincronización Presentismo → Nómina (Fase 1: plomería + Fase 3 esqueleto).
 * Mismo patrón que lib/sincronizar-sharepoint.ts (Consolidados): descarga los
 * Excel reales de SharePoint vía Graph API app-only y los procesa con exceljs.
 * A diferencia de Consolidados/Alquileres, acá el resultado se reescribe en el
 * propio Excel de Nómina en SharePoint (no se persiste en la base de datos).
 *
 * PENDIENTE DE FASE 2 (definir contrato de datos con el layout real de los dos
 * archivos) antes de dar esto por completo — lo marcado como "TODO Fase 2" abajo
 * asume nombres de encabezado razonables ("Legajo", "Estado") que hay que
 * confirmar o ajustar contra los archivos reales:
 * - Nombre exacto de la hoja en cada archivo (por ahora se usa `worksheets[0]`).
 * - Si Presentismo tiene una sola columna "estado de hoy" o una matriz por fecha
 *   igual que Nómina (este código asume la primera opción).
 * - El diccionario de normalización de estados (por ahora solo se hace trim).
 *
 * PENDIENTE DE FASE 0: `subirArchivo` requiere que el App Registration tenga
 * permiso de *aplicación* Files.ReadWrite.All o Sites.ReadWrite.All con consentimiento
 * de administrador. El App Registration ya existe (se reusa el del login), pero
 * los permisos documentados hasta ahora en .env.example eran de solo lectura
 * (Sites.Read.All / Files.Read.All) — verificar en Azure Portal y ampliarlos si
 * hace falta antes del primer run real (no bloquea correr en --dry-run).
 */

function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} en .env.local (ver .env.example).`);
  return valor;
}

/** Normaliza legajo a string comparable (trim). Si en el Excel real el legajo
 * tiene ceros a la izquierda y está guardado como número, esto los pierde —
 * confirmar el tipo de dato real en Fase 2 y ajustar acá si hace falta. */
function normalizarLegajo(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizarEstado(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/** Busca en la fila de encabezados la primera columna cuyo texto matchea `patron`. */
function ubicarColumnaPorHeader(headerRow: ExcelJS.Row, patron: RegExp): number | null {
  let encontrada: number | null = null;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (encontrada !== null) return;
    if (patron.test(normalizarEstado(cell.value))) encontrada = colNumber;
  });
  return encontrada;
}

/** Busca en la fila de encabezados la columna cuya celda es una fecha == `fecha`. */
function ubicarColumnaDelDia(headerRow: ExcelJS.Row, fecha: Date): number | null {
  let encontrada: number | null = null;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (encontrada !== null) return;
    if (cell.value instanceof Date && mismaFechaUTC(cell.value, fecha)) encontrada = colNumber;
  });
  return encontrada;
}

// TODO Fase 2: confirmar contra el archivo real si "Legajo"/"Estado" son los
// encabezados exactos (mayúsculas, acentos, "N° Legajo", etc.) y ajustar estos patrones.
const PATRON_HEADER_LEGAJO = /legajo/i;
const PATRON_HEADER_ESTADO = /estado/i;

/** Lee Presentismo y devuelve el estado de hoy por legajo. */
export async function parsearPresentismo(buffer: Buffer): Promise<RegistroPresentismo[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const hoja = wb.worksheets[0]; // TODO Fase 2: confirmar nombre real de la hoja
  if (!hoja) throw new Error("El Excel de Presentismo no tiene ninguna hoja.");

  const headerRow = hoja.getRow(1);
  const columnaLegajo = ubicarColumnaPorHeader(headerRow, PATRON_HEADER_LEGAJO);
  const columnaEstado = ubicarColumnaPorHeader(headerRow, PATRON_HEADER_ESTADO);
  if (!columnaLegajo || !columnaEstado) {
    throw new Error(
      'No se encontraron las columnas "Legajo" y/o "Estado" en el encabezado de Presentismo. ' +
        "Verificá los nombres exactos de columna (Fase 2) y ajustá los patrones en lib/rrhh/sincronizar-sharepoint.ts."
    );
  }

  const registros: RegistroPresentismo[] = [];
  hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const legajo = normalizarLegajo(row.getCell(columnaLegajo).value);
    if (!legajo) return;
    registros.push({ legajo, estado: normalizarEstado(row.getCell(columnaEstado).value) });
  });
  return registros;
}

export interface OpcionesSincronizacionRrhh {
  dryRun?: boolean;
}

/**
 * Descarga Presentismo y Nómina reales desde SharePoint, mapea por legajo y
 * escribe el estado de hoy en la columna correspondiente de Nómina.
 * En `dryRun` hace todo el proceso de lectura/matching mostrado en el resultado
 * pero no llama a `subirArchivo` — pensado para validar el mapeo contra los
 * archivos reales antes del primer run que escribe de verdad (ver Fase 5).
 */
export async function sincronizarRrhh(opts?: OpcionesSincronizacionRrhh): Promise<ResultadoSincronizacionRrhh> {
  const rutaPresentismo = requerirEnv("SHAREPOINT_RRHH_PRESENTISMO_PATH");
  const rutaNomina = requerirEnv("SHAREPOINT_RRHH_NOMINA_PATH");

  const siteId = await obtenerSiteId();
  const driveId = await obtenerDriveIdPrincipal(siteId);

  const [descargaPresentismo, descargaNomina] = await Promise.all([
    descargarArchivo(driveId, rutaPresentismo),
    descargarArchivo(driveId, rutaNomina),
  ]);

  const registros = await parsearPresentismo(descargaPresentismo.buffer);

  const wbNomina = new ExcelJS.Workbook();
  await wbNomina.xlsx.load(descargaNomina.buffer as any);
  const hoja = wbNomina.worksheets[0]; // TODO Fase 2: confirmar nombre real de la hoja
  if (!hoja) throw new Error("El Excel de Nómina no tiene ninguna hoja.");

  const headerRow = hoja.getRow(1);
  const hoy = hoyART();
  const columnaDia = ubicarColumnaDelDia(headerRow, hoy);
  if (!columnaDia) {
    throw new Error(
      `No se encontró en Nómina una columna de fecha para hoy (${isoDeFecha(hoy)}). ` +
        "Verificá que el encabezado tenga celdas con formato de fecha real (no texto)."
    );
  }
  const columnaLegajo = ubicarColumnaPorHeader(headerRow, PATRON_HEADER_LEGAJO);
  if (!columnaLegajo) {
    throw new Error('No se encontró en Nómina una columna de encabezado "Legajo".');
  }

  const estadoPorLegajo = new Map(registros.map((r) => [r.legajo, r.estado]));
  const legajosEncontrados = new Set<string>();
  let actualizados = 0;
  let sinCambio = 0;

  hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const legajo = normalizarLegajo(row.getCell(columnaLegajo).value);
    if (!legajo) return;
    const estado = estadoPorLegajo.get(legajo);
    if (estado === undefined) return;

    legajosEncontrados.add(legajo);
    const celdaDia = row.getCell(columnaDia);
    if (normalizarEstado(celdaDia.value) === estado) {
      sinCambio++;
      return;
    }
    celdaDia.value = estado;
    actualizados++;
  });

  const huerfanos = registros.map((r) => r.legajo).filter((l) => !legajosEncontrados.has(l));

  if (opts?.dryRun) {
    return {
      legajosLeidos: registros.length,
      legajosActualizados: actualizados,
      legajosSinCambio: sinCambio,
      legajosHuerfanos: huerfanos,
      dryRun: true,
      actualizoNomina: false,
    };
  }

  let actualizoNomina = false;
  if (actualizados > 0) {
    const bufferSalida = await wbNomina.xlsx.writeBuffer();
    await subirArchivo(driveId, descargaNomina.itemId, Buffer.from(bufferSalida));
    actualizoNomina = true;
  }

  return {
    legajosLeidos: registros.length,
    legajosActualizados: actualizados,
    legajosSinCambio: sinCambio,
    legajosHuerfanos: huerfanos,
    dryRun: false,
    actualizoNomina,
  };
}
