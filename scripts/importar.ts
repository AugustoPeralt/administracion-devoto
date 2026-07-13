import ExcelJS from "exceljs";
import { sql as drizzleSql, and, eq, inArray, notInArray } from "drizzle-orm";
import { leerTitulares, leerPlanCuentas, type TitularRow, type CuentaRow } from "./parsers/catalogos";
import { parsearCajaOperativa } from "./parsers/cajas-operativas";
import { parsearCajaObra } from "./parsers/cajas-obra";
import type { ResultadoParseoHoja } from "./parsers/tipos";

export const CAJAS_OPERATIVAS = [
  "ALICIA",
  "BETULAR",
  "MECHA",
  "PEPE",
  "LUCCA",
  "6 BLVD",
  "TAVLON",
  "BENITO",
  "CAJA FRAN",
] as const;

export const CAJAS_OBRA = ["PALERMO", "CENTRO", "MERCAT", "CAJA GENERAL"] as const;

export const NOMBRE_ARCHIVO_2026 = "CONSOLIDADO 2026";
export const NOMBRE_ARCHIVO_OBRAS = "CONSOLIDADO OBRAS";

export interface ArchivoFuente {
  nombre: string;
  workbook: ExcelJS.Workbook;
}

export interface MetaArchivo {
  hash: string;
  modificadoPorSharepoint?: string | null;
  fechaModificacionSharepoint?: Date | null;
}

export interface CajaProcesada {
  nombre: string;
  archivoOrigen: string;
  tipo: "operativa" | "obra";
  resultado: ResultadoParseoHoja;
}

export interface ResultadoParseoCompleto {
  procesadas: CajaProcesada[];
  titulares2026: TitularRow[];
  titularesObras: TitularRow[];
  planCuentas: CuentaRow[];
}

/**
 * Parsea los dos workbooks (sin importar si vinieron de disco local o de un
 * buffer descargado de SharePoint) y devuelve el resultado listo para
 * imprimir/guardar. No toca la base de datos.
 */
export async function parsearArchivos(
  archivo2026: ArchivoFuente,
  archivoObras: ArchivoFuente
): Promise<ResultadoParseoCompleto> {
  const titulares2026 = leerTitulares(archivo2026.workbook, archivo2026.nombre);
  const titularesObras = leerTitulares(archivoObras.workbook, archivoObras.nombre);
  const planCuentas = dedupePorCod([
    ...leerPlanCuentas(archivo2026.workbook),
    ...leerPlanCuentas(archivoObras.workbook),
  ]);

  const titularesPorCod2026 = mapaPorCod(titulares2026);
  const titularesPorCodObras = mapaPorCod(titularesObras);
  const cuentasPorCod = mapaPorCod(planCuentas);

  const procesadas: CajaProcesada[] = [];

  for (const nombre of CAJAS_OPERATIVAS) {
    const sheet = archivo2026.workbook.getWorksheet(nombre);
    if (!sheet) {
      console.warn(`[AVISO] No se encontro la hoja "${nombre}" en ${archivo2026.nombre}, se omite.`);
      continue;
    }
    const resultado = parsearCajaOperativa(sheet, titularesPorCod2026);
    procesadas.push({ nombre, archivoOrigen: archivo2026.nombre, tipo: "operativa", resultado });
  }

  for (const nombre of CAJAS_OBRA) {
    const sheet = archivoObras.workbook.getWorksheet(nombre);
    if (!sheet) {
      console.warn(`[AVISO] No se encontro la hoja "${nombre}" en ${archivoObras.nombre}, se omite.`);
      continue;
    }
    const resultado = parsearCajaObra(sheet, titularesPorCodObras, cuentasPorCod);
    procesadas.push({ nombre, archivoOrigen: archivoObras.nombre, tipo: "obra", resultado });
  }

  return { procesadas, titulares2026, titularesObras, planCuentas };
}

export function imprimirResumen(procesadas: CajaProcesada[]) {
  console.log("=".repeat(80));
  console.log("RESUMEN DE PARSEO");
  console.log("=".repeat(80));

  let totalMovimientos = 0;
  let totalRequiereJustificacion = 0;
  let totalAnomalias = 0;
  let totalDescartadas = 0;

  for (const { nombre, archivoOrigen, resultado } of procesadas) {
    const anomalias = resultado.movimientos.filter((m) => m.anomalia).length;
    const ajustes = resultado.movimientos.filter((m) => m.requiereJustificacion).length;

    totalMovimientos += resultado.movimientos.length;
    totalRequiereJustificacion += ajustes;
    totalAnomalias += anomalias;
    totalDescartadas += resultado.filasDescartadas.length;

    const diffArs =
      resultado.totalSegunExcelArs !== null
        ? Math.abs(
            resultado.totalSegunExcelArs -
              (resultado.movimientos.at(-1)?.saldoAcumuladoArs ?? resultado.saldoInicialArs)
          )
        : null;

    console.log(
      `[${archivoOrigen}] ${nombre.padEnd(12)} movimientos=${String(resultado.movimientos.length).padStart(4)}  ` +
        `anomalias=${String(anomalias).padStart(3)}  ajustes_ocultos=${String(ajustes).padStart(2)}  ` +
        `fila_totales=${resultado.filaTotales ?? "NO ENCONTRADA"}  ` +
        `diff_vs_excel_ars=${diffArs === null ? "N/A" : diffArs.toFixed(2)}`
    );

    if (ajustes > 0) {
      for (const m of resultado.movimientos.filter((mm) => mm.requiereJustificacion)) {
        console.log(
          `    -> AJUSTE OCULTO fila ${m.filaExcel}: "${m.descripcionFinal}" | formula="${m.formulaOriginal}" | monto=${m.montoArs}`
        );
      }
    }
  }

  console.log("-".repeat(80));
  console.log(
    `TOTAL: ${totalMovimientos} movimientos | ${totalRequiereJustificacion} requieren justificacion | ` +
      `${totalAnomalias} con anomalia | ${totalDescartadas} filas descartadas`
  );
  console.log("=".repeat(80));
}

export async function importarADB(
  procesadas: CajaProcesada[],
  titulares2026: TitularRow[],
  titularesObras: TitularRow[],
  planCuentas: CuentaRow[],
  metaPorArchivo: Record<string, MetaArchivo>
) {
  const { db } = await import("../db");
  const {
    cajas,
    titulares,
    planCuentas: planCuentasTabla,
    movimientosCaja,
    registroAuditoria,
    consistenciaSaldos,
    justificacionesAuditoria,
  } = await import("../db/schema");

  console.log("\nImportando a Neon...");

  // 1. Cajas
  const cajaIdPorNombre = new Map<string, number>();
  for (const { nombre, archivoOrigen, tipo } of procesadas) {
    const [row] = await db
      .insert(cajas)
      .values({ nombre, archivoOrigen, tipo })
      .onConflictDoUpdate({
        target: [cajas.nombre, cajas.archivoOrigen],
        set: { tipo },
      })
      .returning({ id: cajas.id });
    cajaIdPorNombre.set(`${archivoOrigen}::${nombre}`, row.id);
  }
  console.log(`  cajas: ${cajaIdPorNombre.size} upserted`);

  // 2. Titulares
  for (const chunk of chunked([...titulares2026, ...titularesObras], 200)) {
    await db
      .insert(titulares)
      .values(chunk)
      .onConflictDoUpdate({
        target: [titulares.archivoOrigen, titulares.cod],
        set: {
          nombre: drizzleSql`excluded.nombre`,
          grupo1: drizzleSql`excluded.grupo1`,
          grupo2: drizzleSql`excluded.grupo2`,
          grupo3: drizzleSql`excluded.grupo3`,
          razonSocial: drizzleSql`excluded.razon_social`,
          cuit: drizzleSql`excluded.cuit`,
          telefono: drizzleSql`excluded.telefono`,
        },
      });
  }
  console.log(`  titulares: ${titulares2026.length + titularesObras.length} upserted`);

  // 3. Plan de cuentas
  for (const chunk of chunked(planCuentas, 200)) {
    await db
      .insert(planCuentasTabla)
      .values(chunk)
      .onConflictDoUpdate({
        target: [planCuentasTabla.cod],
        set: {
          grupo: drizzleSql`excluded.grupo`,
          rubro: drizzleSql`excluded.rubro`,
          subrubro: drizzleSql`excluded.subrubro`,
          cuenta: drizzleSql`excluded.cuenta`,
        },
      });
  }
  console.log(`  plan_cuentas: ${planCuentas.length} upserted`);

  // 4. Movimientos + consistencia de saldos + registro de auditoria
  let totalMovs = 0;
  let totalLogs = 0;
  for (const { nombre, archivoOrigen, resultado } of procesadas) {
    const cajaId = cajaIdPorNombre.get(`${archivoOrigen}::${nombre}`)!;
    const meta = metaPorArchivo[archivoOrigen];
    if (!meta) throw new Error(`Falta metadata (hash) para el archivo "${archivoOrigen}"`);

    const filas = resultado.movimientos.map((m) => ({
      cajaId,
      archivoOrigen,
      filaExcel: m.filaExcel,
      fecha: m.fecha,
      codTitular: m.codTitular,
      titularResuelto: m.titularResuelto,
      codCuenta: m.codCuenta,
      cuentaResuelta: m.cuentaResuelta,
      conceptoManual: m.conceptoManual,
      descripcionFinal: m.descripcionFinal,
      montoArs: m.montoArs.toFixed(2),
      montoUsd: m.montoUsd !== null ? m.montoUsd.toFixed(2) : null,
      tipoMovimiento: m.tipoMovimiento,
      saldoAcumuladoArs: m.saldoAcumuladoArs.toFixed(2),
      saldoAcumuladoUsd: m.saldoAcumuladoUsd.toFixed(2),
      formulaOriginal: m.formulaOriginal,
      requiereJustificacion: m.requiereJustificacion,
      esSaldoInicial: false,
      anomalia: m.anomalia,
      colorFondo: m.colorFondo,
    }));

    for (const chunk of chunked(filas, 200)) {
      await db
        .insert(movimientosCaja)
        .values(chunk)
        .onConflictDoUpdate({
          target: [movimientosCaja.archivoOrigen, movimientosCaja.cajaId, movimientosCaja.filaExcel],
          set: {
            fecha: drizzleSql`excluded.fecha`,
            codTitular: drizzleSql`excluded.cod_titular`,
            titularResuelto: drizzleSql`excluded.titular_resuelto`,
            codCuenta: drizzleSql`excluded.cod_cuenta`,
            cuentaResuelta: drizzleSql`excluded.cuenta_resuelta`,
            conceptoManual: drizzleSql`excluded.concepto_manual`,
            descripcionFinal: drizzleSql`excluded.descripcion_final`,
            montoArs: drizzleSql`excluded.monto_ars`,
            montoUsd: drizzleSql`excluded.monto_usd`,
            tipoMovimiento: drizzleSql`excluded.tipo_movimiento`,
            saldoAcumuladoArs: drizzleSql`excluded.saldo_acumulado_ars`,
            saldoAcumuladoUsd: drizzleSql`excluded.saldo_acumulado_usd`,
            formulaOriginal: drizzleSql`excluded.formula_original`,
            requiereJustificacion: drizzleSql`excluded.requiere_justificacion`,
            anomalia: drizzleSql`excluded.anomalia`,
            colorFondo: drizzleSql`excluded.color_fondo`,
          },
        });
    }
    totalMovs += filas.length;

    // Filas "huérfanas": cuando se inserta/borra una fila en el Excel original, las
    // filas de abajo se corren de posición. El upsert de arriba (clave natural
    // archivo+caja+fila_excel) actualiza correctamente las filas que sí tienen
    // contenido en la posición actual, pero nunca borra una fila que quedó en la
    // base de una sincronización anterior y ya no corresponde a ninguna fila real
    // del Excel de hoy — se queda para siempre con su contenido viejo, apareciendo
    // como un "duplicado" del movimiento real que se corrió de lugar. Se borran acá
    // (con sus justificaciones, si tenía) para que cada sincronización refleje
    // exactamente el estado actual del Excel, no un acumulado de restos viejos.
    const filaExcelActuales = filas.map((f) => f.filaExcel);
    if (filaExcelActuales.length > 0) {
      const huerfanos = await db
        .select({ id: movimientosCaja.id })
        .from(movimientosCaja)
        .where(
          and(
            eq(movimientosCaja.archivoOrigen, archivoOrigen),
            eq(movimientosCaja.cajaId, cajaId),
            notInArray(movimientosCaja.filaExcel, filaExcelActuales)
          )
        );

      if (huerfanos.length > 0) {
        const idsHuerfanos = huerfanos.map((h) => h.id);
        await db.delete(justificacionesAuditoria).where(inArray(justificacionesAuditoria.movimientoId, idsHuerfanos));
        await db.delete(movimientosCaja).where(inArray(movimientosCaja.id, idsHuerfanos));
        console.log(`  [${archivoOrigen}] ${nombre}: ${huerfanos.length} fila(s) huérfana(s) eliminada(s)`);
      }
    }

    const saldoCalculadoArs = resultado.movimientos.at(-1)?.saldoAcumuladoArs ?? resultado.saldoInicialArs;
    const saldoCalculadoUsd = resultado.movimientos.at(-1)?.saldoAcumuladoUsd ?? resultado.saldoInicialUsd;
    const diferenciaArs =
      resultado.totalSegunExcelArs !== null ? resultado.totalSegunExcelArs - saldoCalculadoArs : null;
    const diferenciaUsd =
      resultado.totalSegunExcelUsd !== null ? resultado.totalSegunExcelUsd - saldoCalculadoUsd : null;

    await db
      .insert(consistenciaSaldos)
      .values({
        cajaId,
        saldoCalculadoArs: saldoCalculadoArs.toFixed(2),
        saldoExcelArs: resultado.totalSegunExcelArs !== null ? resultado.totalSegunExcelArs.toFixed(2) : null,
        diferenciaArs: diferenciaArs !== null ? diferenciaArs.toFixed(2) : null,
        saldoCalculadoUsd: saldoCalculadoUsd.toFixed(2),
        saldoExcelUsd: resultado.totalSegunExcelUsd !== null ? resultado.totalSegunExcelUsd.toFixed(2) : null,
        diferenciaUsd: diferenciaUsd !== null ? diferenciaUsd.toFixed(2) : null,
        filaTotalesEncontrada: resultado.filaTotales !== null,
        verificadoEn: new Date(),
      })
      .onConflictDoUpdate({
        target: [consistenciaSaldos.cajaId],
        set: {
          saldoCalculadoArs: drizzleSql`excluded.saldo_calculado_ars`,
          saldoExcelArs: drizzleSql`excluded.saldo_excel_ars`,
          diferenciaArs: drizzleSql`excluded.diferencia_ars`,
          saldoCalculadoUsd: drizzleSql`excluded.saldo_calculado_usd`,
          saldoExcelUsd: drizzleSql`excluded.saldo_excel_usd`,
          diferenciaUsd: drizzleSql`excluded.diferencia_usd`,
          filaTotalesEncontrada: drizzleSql`excluded.fila_totales_encontrada`,
          verificadoEn: drizzleSql`excluded.verificado_en`,
        },
      });

    const logs = [
      {
        archivo: archivoOrigen,
        hashArchivo: meta.hash,
        fechaModificacionSharepoint: meta.fechaModificacionSharepoint ?? null,
        modificadoPorSharepoint: meta.modificadoPorSharepoint ?? null,
        hoja: nombre,
        filaExcel: null as number | null,
        tipoAnomalia: null as string | null,
        accionTomada: "importado" as const,
      },
      ...resultado.filasDescartadas.map((fd) => ({
        archivo: archivoOrigen,
        hashArchivo: meta.hash,
        fechaModificacionSharepoint: meta.fechaModificacionSharepoint ?? null,
        modificadoPorSharepoint: meta.modificadoPorSharepoint ?? null,
        hoja: nombre,
        filaExcel: fd.fila,
        tipoAnomalia: fd.motivo,
        accionTomada: "descartado" as const,
      })),
      ...resultado.movimientos
        .filter((m) => m.anomalia)
        .map((m) => ({
          archivo: archivoOrigen,
          hashArchivo: meta.hash,
          fechaModificacionSharepoint: meta.fechaModificacionSharepoint ?? null,
          modificadoPorSharepoint: meta.modificadoPorSharepoint ?? null,
          hoja: nombre,
          filaExcel: m.filaExcel,
          tipoAnomalia: m.anomalia,
          accionTomada: "marcado_revision" as const,
        })),
    ];

    for (const chunk of chunked(logs, 200)) {
      await db.insert(registroAuditoria).values(chunk);
    }
    totalLogs += logs.length;
  }

  console.log(`  movimientos_caja: ${totalMovs} upserted`);
  console.log(`  registro_auditoria: ${totalLogs} filas insertadas`);
  console.log("\nImportacion completa.");
}

function mapaPorCod(rows: TitularRow[] | CuentaRow[]): Map<number, TitularRow & CuentaRow> {
  const m = new Map<number, any>();
  for (const r of rows) m.set(r.cod, r);
  return m;
}

function dedupePorCod<T extends { cod: number }>(rows: T[]): T[] {
  const m = new Map<number, T>();
  for (const r of rows) m.set(r.cod, r);
  return [...m.values()];
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
