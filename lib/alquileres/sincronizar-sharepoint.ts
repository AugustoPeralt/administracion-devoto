import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { obtenerSiteId, obtenerDriveIdPrincipal, listarCarpeta, descargarArchivo } from "../sharepoint";
import { extraerAlquileres } from "./cbc-parser";
import { cargarMaestro } from "./contratos-parser";
import { calcularAlertas } from "./alertas";
import { hoyUTC } from "./fechas";
import type { AlquilerMensual, CanonVigenteConfig, Contrato } from "./tipos";

/**
 * Sincronización de Alquileres — mismo patrón que lib/sincronizar-sharepoint.ts
 * (Consolidados), con dos diferencias impuestas por el estado real de los datos:
 *
 * 1. Los CBC NO viven en una única carpeta centralizada (a diferencia de
 *    Consolidados) — cada local tiene su propia carpeta "Contabilidades <LOCAL>"
 *    en SharePoint, con el CBC adentro (a veces en una subcarpeta "CBC"/"CBC
 *    ACTUAL", a veces suelto en la raíz). Por eso `descubrirCbcs` recorre el
 *    árbol completo buscando archivos que empiecen con "CBC" y terminen en
 *    ".xlsm", en vez de listar una ruta fija.
 * 2. El Excel maestro de contratos ("PLAZO_DE_CONTRATOS_DE_LOCACION...") todavía
 *    no está accesible en SharePoint (pendiente de permisos) — se lee de
 *    `archivosAlquileres/` (gitignored, mismo criterio que
 *    archivosCopiaDeConsolidados/). Cuando se confirme la ruta real de
 *    SharePoint, reemplazar `leerMaestroLocal` por `descargarArchivo`.
 */

const CONTABILIDADES_ROOT = process.env.SHAREPOINT_ALQ_CONTABILIDADES_PATH ?? "/CONTABILIDADES";
const MASTER_LOCAL_PATH =
  process.env.ALQ_CONTRATOS_MAESTRO_PATH ??
  path.join(process.cwd(), "archivosAlquileres", "PLAZO_DE_CONTRATOS_DE_LOCACION_-_GASTRONOMICOS.xlsx");

const CONCURRENCIA_LISTADO = 8;

// Cada local vive en una carpeta "Contabilidades <LOCAL>" directamente bajo
// CONTABILIDADES_ROOT (verificado contra el drive real) — cualquier otra carpeta
// de primer nivel (BALANCES, back, OFICINA, PLANES, "Contabilidad Modelo", etc.)
// no corresponde a un local y se ignora.
const RE_CARPETA_LOCAL = /^Contabilidades\s+/i;

// Dentro de "Contabilidades <LOCAL>" el CBC vigente vive en la raíz o en una
// subcarpeta llamada exactamente "CBC" o "CBC ACTUAL" — NUNCA en carpetas tipo
// "back up"/"Backups"/"Back Up"/"BALANCE 2023" que existen en varios locales y
// contienen copias viejas o duplicadas del mismo archivo. Recorrer todo el árbol
// sin este filtro trae ruido real (verificado: ENTREVIAS tiene el mismo CBC
// duplicado en "back up" y en "CBC"; MACARONS tiene CBCs de 2023-2025 sueltos en
// sus carpetas BALANCE 20XX).
const RE_CARPETA_CBC_VIGENTE = /^CBC(\s*ACTUAL)?$/i;

export interface CbcEncontrado {
  path: string;
  nombre: string;
}

/** Ejecuta `fn` sobre `items` con a lo sumo `concurrencia` llamadas en simultáneo. */
async function mapearConcurrencia<T, R>(
  items: T[],
  concurrencia: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;
  async function trabajador() {
    while (indice < items.length) {
      const i = indice++;
      resultados[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, trabajador));
  return resultados;
}

function archivosCbc(items: { esCarpeta: boolean; nombre: string }[], root: string): CbcEncontrado[] {
  return items
    .filter((i) => !i.esCarpeta && /^CBC.*\.xlsm$/i.test(i.nombre) && !i.nombre.startsWith("~$"))
    .map((i) => ({ path: `${root}/${i.nombre}`, nombre: i.nombre }));
}

/** Busca el CBC vigente de cada carpeta "Contabilidades <LOCAL>" bajo CONTABILIDADES_ROOT. */
export async function descubrirCbcs(
  driveId: string,
  root: string = CONTABILIDADES_ROOT
): Promise<CbcEncontrado[]> {
  const raiz = await listarCarpeta(driveId, root);
  const carpetasLocal = raiz.filter((i) => i.esCarpeta && RE_CARPETA_LOCAL.test(i.nombre));

  const porLocal = await mapearConcurrencia(carpetasLocal, CONCURRENCIA_LISTADO, async (carpeta) => {
    const path = `${root}/${carpeta.nombre}`;
    let items;
    try {
      items = await listarCarpeta(driveId, path);
    } catch {
      return [] as CbcEncontrado[];
    }

    const encontrados = archivosCbc(items, path);

    // Puede haber más de una subcarpeta candidata a la vez (ej. MACARONS tiene
    // "CBC" Y "CBC ACTUAL" como hermanas) — revisar todas, no solo la primera.
    const carpetasCbc = items.filter((i) => i.esCarpeta && RE_CARPETA_CBC_VIGENTE.test(i.nombre));
    for (const carpetaCbc of carpetasCbc) {
      const pathCbc = `${path}/${carpetaCbc.nombre}`;
      try {
        encontrados.push(...archivosCbc(await listarCarpeta(driveId, pathCbc), pathCbc));
      } catch {
        // subcarpeta CBC listada pero no accesible — se ignora, no aborta el resto.
      }
    }
    return encontrados;
  });

  return porLocal.flat();
}

function hashBuffer(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export interface ResultadoSincronizacionAlquileres {
  syncRunId: number;
  cbcsEncontrados: number;
  cbcsProcesados: number;
  cbcsSinCambios: number;
  cbcsFallidos: number;
  alertasGeneradas: number;
  errores: { archivo: string; mensaje: string }[];
  maestroActualizado: boolean;
}

export async function sincronizarAlquileres(opts?: {
  forzar?: boolean;
  usuarioEmail?: string;
}): Promise<ResultadoSincronizacionAlquileres> {
  const { db } = await import("../../db");
  const {
    alqLocales,
    alqContratos,
    alqAlquileresMensuales,
    alqFacturas,
    alqPagos,
    alqCanonVigenteConfig,
    alqAlertas,
    alqLocalesMapping,
    alqSyncRuns,
  } = await import("../../db/schema");

  const errores: { archivo: string; mensaje: string }[] = [];
  const hoy = hoyUTC();

  const [{ id: syncRunId }] = await db
    .insert(alqSyncRuns)
    .values({ estado: "en_curso", usuarioEmail: opts?.usuarioEmail ?? null })
    .returning({ id: alqSyncRuns.id });

  const hashesPrevios = await obtenerHashesUltimaCorrida(db, alqSyncRuns, syncRunId);
  const hashesActuales: Record<string, string> = {};

  // ── 1. Mapeo proveedor → local (reemplaza locales_mapping.json) ───────────
  const filasMapping = await db
    .select({ proveedorCbc: alqLocalesMapping.proveedorCbc, localCanonico: alqLocalesMapping.localCanonico })
    .from(alqLocalesMapping)
    .where(eq(alqLocalesMapping.activo, true));
  const mapping: Record<string, string> = Object.fromEntries(
    filasMapping.map((f) => [f.proveedorCbc, f.localCanonico])
  );

  // ── 2. Descubrir y procesar CBCs ────────────────────────────────────────────
  const siteId = await obtenerSiteId();
  const driveId = await obtenerDriveIdPrincipal(siteId);

  const cbcs = await descubrirCbcs(driveId);
  let cbcsProcesados = 0;
  let cbcsSinCambios = 0;
  let cbcsFallidos = 0;

  for (const cbc of cbcs) {
    try {
      const { buffer } = await descargarArchivo(driveId, cbc.path);
      const hash = hashBuffer(buffer);
      hashesActuales[cbc.path] = hash;

      if (!opts?.forzar && hashesPrevios[cbc.path] === hash) {
        cbcsSinCambios++;
        continue;
      }

      const { alquileres } = await extraerAlquileres(buffer, mapping, cbc.nombre);
      for (const alquiler of alquileres) {
        await upsertAlquilerMensual(db, { alqAlquileresMensuales, alqFacturas, alqPagos }, alquiler, syncRunId);
      }
      cbcsProcesados++;
    } catch (err) {
      cbcsFallidos++;
      errores.push({ archivo: cbc.path, mensaje: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 3. Excel maestro de contratos (local hasta tener acceso al SharePoint real) ──
  let maestroActualizado = false;
  try {
    const masterBuffer = fs.readFileSync(MASTER_LOCAL_PATH);
    const hashMaestro = hashBuffer(masterBuffer);
    hashesActuales[MASTER_LOCAL_PATH] = hashMaestro;

    if (opts?.forzar || hashesPrevios[MASTER_LOCAL_PATH] !== hashMaestro) {
      const contratosPorLocal = await cargarMaestro(masterBuffer);
      await upsertContratos(db, { alqLocales, alqContratos }, contratosPorLocal);
      maestroActualizado = true;
    }
  } catch (err) {
    errores.push({
      archivo: MASTER_LOCAL_PATH,
      mensaje:
        err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `Excel maestro no encontrado en ${MASTER_LOCAL_PATH}. Copiá ahí el archivo real (ver lib/alquileres/sincronizar-sharepoint.ts).`
          : err instanceof Error
            ? err.message
            : String(err),
    });
  }

  // ── 4. Recalcular alertas sobre el estado COMPLETO en DB (no solo lo tocado) ──
  const [contratosActuales, alquileresActuales, canonVigenteActual] = await Promise.all([
    cargarContratosDesdeDb(db, { alqContratos, alqLocales }),
    cargarAlquileresDesdeDb(db, { alqAlquileresMensuales, alqFacturas, alqPagos }),
    cargarCanonVigenteDesdeDb(db, alqCanonVigenteConfig),
  ]);

  const alertas = calcularAlertas(contratosActuales, alquileresActuales, canonVigenteActual, hoy);

  if (alertas.length > 0) {
    await db.insert(alqAlertas).values(
      alertas.map((a) => ({
        syncRunId,
        prioridad: mapPrioridad(a.prioridad),
        local: a.local,
        tipoAlerta: mapTipoAlerta(a.tipoAlerta),
        descripcion: a.descripcion,
        fechaEvento: a.fechaEvento,
        diasRestantes: a.diasRestantes,
        accionRequerida: a.accionRequerida,
      }))
    );
  }

  // ── 5. Cerrar la corrida ─────────────────────────────────────────────────────
  await db
    .update(alqSyncRuns)
    .set({
      finalizadoEn: new Date(),
      estado: errores.length > 0 ? "con_errores" : "completado",
      cbcsProcesados,
      cbcsFallidos,
      erroresJson: errores.length > 0 ? JSON.stringify(errores) : null,
      hashesJson: JSON.stringify(hashesActuales),
    })
    .where(eq(alqSyncRuns.id, syncRunId));

  return {
    syncRunId,
    cbcsEncontrados: cbcs.length,
    cbcsProcesados,
    cbcsSinCambios,
    cbcsFallidos,
    alertasGeneradas: alertas.length,
    errores,
    maestroActualizado,
  };
}

// ── Helpers de lectura/escritura DB ───────────────────────────────────────────

async function obtenerHashesUltimaCorrida(
  db: any,
  alqSyncRuns: any,
  syncRunIdActual: number
): Promise<Record<string, string>> {
  const filas = await db
    .select({ hashesJson: alqSyncRuns.hashesJson })
    .from(alqSyncRuns)
    .where(drizzleSql`${alqSyncRuns.id} < ${syncRunIdActual} and ${alqSyncRuns.hashesJson} is not null`)
    .orderBy(drizzleSql`${alqSyncRuns.id} desc`)
    .limit(1);
  const json = filas[0]?.hashesJson;
  return json ? JSON.parse(json) : {};
}

async function upsertAlquilerMensual(
  db: any,
  tablas: { alqAlquileresMensuales: any; alqFacturas: any; alqPagos: any },
  alquiler: AlquilerMensual,
  syncRunId: number
) {
  const { alqAlquileresMensuales, alqFacturas, alqPagos } = tablas;

  const [{ id: alquilerId }] = await db
    .insert(alqAlquileresMensuales)
    .values({
      local: alquiler.local,
      proveedorCbc: alquiler.proveedorCbc,
      mes: alquiler.mes,
      totalFacturado: alquiler.totalFacturado.toFixed(2),
      totalPagado: alquiler.totalPagado.toFixed(2),
      saldo: alquiler.saldo.toFixed(2),
      fechaUltimoPago: alquiler.fechaUltimoPago,
      syncRunId,
    })
    .onConflictDoUpdate({
      target: [alqAlquileresMensuales.local, alqAlquileresMensuales.mes],
      set: {
        proveedorCbc: drizzleSql`excluded.proveedor_cbc`,
        totalFacturado: drizzleSql`excluded.total_facturado`,
        totalPagado: drizzleSql`excluded.total_pagado`,
        saldo: drizzleSql`excluded.saldo`,
        fechaUltimoPago: drizzleSql`excluded.fecha_ultimo_pago`,
        syncRunId: drizzleSql`excluded.sync_run_id`,
      },
    })
    .returning({ id: alqAlquileresMensuales.id });

  // El CBC es la fuente de verdad completa para este (local, mes) — se
  // reemplazan las facturas/pagos hijos en vez de acumularlos entre corridas.
  await db.delete(alqFacturas).where(eq(alqFacturas.alquilerMensualId, alquilerId));
  await db.delete(alqPagos).where(eq(alqPagos.alquilerMensualId, alquilerId));

  if (alquiler.facturas.length > 0) {
    await db.insert(alqFacturas).values(
      alquiler.facturas.map((f) => ({
        alquilerMensualId: alquilerId,
        fecha: f.fecha,
        razonSocial: f.razonSocial,
        cuit: f.cuit,
        monto: f.monto.toFixed(2),
        tipoComprobante: f.tipoComprobante,
      }))
    );
  }
  if (alquiler.pagos.length > 0) {
    await db.insert(alqPagos).values(
      alquiler.pagos.map((p) => ({
        alquilerMensualId: alquilerId,
        fecha: p.fecha,
        monto: p.monto.toFixed(2),
        medio: p.medio,
        nroCheque: p.nroCheque || null,
      }))
    );
  }
}

async function upsertContratos(
  db: any,
  tablas: { alqLocales: any; alqContratos: any },
  contratosPorLocal: Record<string, Contrato[]>
) {
  const { alqLocales, alqContratos } = tablas;

  for (const [local, contratos] of Object.entries(contratosPorLocal)) {
    const [{ id: localId }] = await db
      .insert(alqLocales)
      .values({ nombre: local })
      .onConflictDoUpdate({ target: alqLocales.nombre, set: { nombre: drizzleSql`excluded.nombre` } })
      .returning({ id: alqLocales.id });

    for (const c of contratos) {
      await db
        .insert(alqContratos)
        .values({
          localId,
          contratoIdExcel: c.id,
          estado: mapEstadoContrato(c.estado),
          tipo: c.tipo || null,
          domicilio: c.domicilio || null,
          partes: c.partes || null,
          fechaContrato: c.fechaContrato,
          vencimiento: c.vencimiento,
          plazo: c.plazo || null,
          valorMoneda: c.valorMoneda || null,
          actualizacion: c.actualizacion || null,
          prorroga: c.prorroga || null,
          voluntad: c.voluntad || null,
          renegociacion: c.renegociacion || null,
          actualizadoEn: new Date(),
        })
        .onConflictDoUpdate({
          target: [alqContratos.localId, alqContratos.contratoIdExcel],
          set: {
            estado: drizzleSql`excluded.estado`,
            tipo: drizzleSql`excluded.tipo`,
            domicilio: drizzleSql`excluded.domicilio`,
            partes: drizzleSql`excluded.partes`,
            fechaContrato: drizzleSql`excluded.fecha_contrato`,
            vencimiento: drizzleSql`excluded.vencimiento`,
            plazo: drizzleSql`excluded.plazo`,
            valorMoneda: drizzleSql`excluded.valor_moneda`,
            actualizacion: drizzleSql`excluded.actualizacion`,
            prorroga: drizzleSql`excluded.prorroga`,
            voluntad: drizzleSql`excluded.voluntad`,
            renegociacion: drizzleSql`excluded.renegociacion`,
            actualizadoEn: drizzleSql`excluded.actualizado_en`,
          },
        });
    }
  }
}

async function cargarContratosDesdeDb(
  db: any,
  tablas: { alqContratos: any; alqLocales: any }
): Promise<Record<string, Contrato[]>> {
  const { alqContratos, alqLocales } = tablas;
  const filas = await db
    .select({
      local: alqLocales.nombre,
      id: alqContratos.contratoIdExcel,
      estado: alqContratos.estado,
      tipo: alqContratos.tipo,
      domicilio: alqContratos.domicilio,
      partes: alqContratos.partes,
      fechaContrato: alqContratos.fechaContrato,
      vencimiento: alqContratos.vencimiento,
      plazo: alqContratos.plazo,
      valorMoneda: alqContratos.valorMoneda,
      actualizacion: alqContratos.actualizacion,
      prorroga: alqContratos.prorroga,
      voluntad: alqContratos.voluntad,
      renegociacion: alqContratos.renegociacion,
    })
    .from(alqContratos)
    .innerJoin(alqLocales, eq(alqContratos.localId, alqLocales.id));

  const resultado: Record<string, Contrato[]> = {};
  for (const f of filas) {
    const contrato: Contrato = {
      local: f.local,
      id: f.id,
      estado: mapEstadoContratoInverso(f.estado),
      tipo: f.tipo ?? "",
      domicilio: f.domicilio ?? "",
      partes: f.partes ?? "",
      fechaContrato: f.fechaContrato,
      vencimiento: f.vencimiento,
      plazo: f.plazo ?? "",
      valorMoneda: f.valorMoneda ?? "",
      actualizacion: f.actualizacion ?? "",
      prorroga: f.prorroga ?? "",
      voluntad: f.voluntad ?? "",
      renegociacion: f.renegociacion ?? "",
    };
    (resultado[f.local] ??= []).push(contrato);
  }
  return resultado;
}

async function cargarAlquileresDesdeDb(
  db: any,
  tablas: { alqAlquileresMensuales: any; alqFacturas: any; alqPagos: any }
): Promise<AlquilerMensual[]> {
  const { alqAlquileresMensuales, alqFacturas, alqPagos } = tablas;

  const [filasAlquiler, filasFacturas, filasPagos] = await Promise.all([
    db
      .select({
        id: alqAlquileresMensuales.id,
        local: alqAlquileresMensuales.local,
        proveedorCbc: alqAlquileresMensuales.proveedorCbc,
        mes: alqAlquileresMensuales.mes,
        totalFacturado: alqAlquileresMensuales.totalFacturado,
        totalPagado: alqAlquileresMensuales.totalPagado,
        saldo: alqAlquileresMensuales.saldo,
        fechaUltimoPago: alqAlquileresMensuales.fechaUltimoPago,
      })
      .from(alqAlquileresMensuales),
    db
      .select({
        alquilerMensualId: alqFacturas.alquilerMensualId,
        fecha: alqFacturas.fecha,
        razonSocial: alqFacturas.razonSocial,
        cuit: alqFacturas.cuit,
        monto: alqFacturas.monto,
        tipoComprobante: alqFacturas.tipoComprobante,
      })
      .from(alqFacturas),
    db
      .select({
        alquilerMensualId: alqPagos.alquilerMensualId,
        fecha: alqPagos.fecha,
        monto: alqPagos.monto,
        medio: alqPagos.medio,
        nroCheque: alqPagos.nroCheque,
      })
      .from(alqPagos),
  ]);

  const facturasPorPadre = new Map<number, typeof filasFacturas>();
  for (const f of filasFacturas) {
    (facturasPorPadre.get(f.alquilerMensualId) ?? facturasPorPadre.set(f.alquilerMensualId, []).get(f.alquilerMensualId)!).push(
      f
    );
  }
  const pagosPorPadre = new Map<number, typeof filasPagos>();
  for (const p of filasPagos) {
    (pagosPorPadre.get(p.alquilerMensualId) ?? pagosPorPadre.set(p.alquilerMensualId, []).get(p.alquilerMensualId)!).push(p);
  }

  return filasAlquiler.map((a: any) => ({
    local: a.local,
    proveedorCbc: a.proveedorCbc,
    mes: a.mes,
    totalFacturado: Number(a.totalFacturado),
    totalPagado: Number(a.totalPagado),
    saldo: Number(a.saldo),
    fechaUltimoPago: a.fechaUltimoPago,
    facturas: (facturasPorPadre.get(a.id) ?? []).map((f: any) => ({
      fecha: f.fecha,
      razonSocial: f.razonSocial,
      cuit: f.cuit,
      monto: Number(f.monto),
      tipoComprobante: f.tipoComprobante,
    })),
    pagos: (pagosPorPadre.get(a.id) ?? []).map((p: any) => ({
      fecha: p.fecha,
      monto: Number(p.monto),
      medio: p.medio,
      nroCheque: p.nroCheque ?? "",
    })),
  }));
}

async function cargarCanonVigenteDesdeDb(db: any, alqCanonVigenteConfig: any): Promise<CanonVigenteConfig> {
  const filas = await db
    .select({
      local: alqCanonVigenteConfig.local,
      diaPagoDesde: alqCanonVigenteConfig.diaPagoDesde,
      diaPagoHasta: alqCanonVigenteConfig.diaPagoHasta,
      proximoAjuste: alqCanonVigenteConfig.proximoAjuste,
      indiceAjuste: alqCanonVigenteConfig.indiceAjuste,
      preavisoProrrogaDias: alqCanonVigenteConfig.preavisoProrrogaDias,
    })
    .from(alqCanonVigenteConfig);

  const resultado: CanonVigenteConfig = {};
  for (const f of filas) {
    resultado[f.local] = {
      diaPagoDesde: f.diaPagoDesde,
      diaPagoHasta: f.diaPagoHasta,
      proximoAjuste: f.proximoAjuste,
      indiceAjuste: f.indiceAjuste,
      preavisoProrrogaDias: f.preavisoProrrogaDias,
    };
  }
  return resultado;
}

// ── Mapeos entre las strings en memoria (mirror de Python) y los enums DB ────

function mapEstadoContrato(estado: string): "vigente" | "historico" | "adenda" | "pendiente" {
  const m: Record<string, "vigente" | "historico" | "adenda" | "pendiente"> = {
    Vigente: "vigente",
    "Histórico": "historico",
    Adenda: "adenda",
    Pendiente: "pendiente",
  };
  const val = m[estado];
  if (!val) throw new Error(`Estado de contrato desconocido: "${estado}"`);
  return val;
}

function mapEstadoContratoInverso(estado: string): string {
  const m: Record<string, string> = {
    vigente: "Vigente",
    historico: "Histórico",
    adenda: "Adenda",
    pendiente: "Pendiente",
  };
  return m[estado] ?? estado;
}

function mapPrioridad(prioridad: string): "critica" | "urgente" | "proxima" | "informativa" {
  const m: Record<string, "critica" | "urgente" | "proxima" | "informativa"> = {
    "CRÍTICA": "critica",
    URGENTE: "urgente",
    "PRÓXIMA": "proxima",
    INFORMATIVA: "informativa",
  };
  const val = m[prioridad];
  if (!val) throw new Error(`Prioridad de alerta desconocida: "${prioridad}"`);
  return val;
}

function mapTipoAlerta(
  tipo: string
):
  | "vencimiento_contrato"
  | "decision_prorroga"
  | "pago_pendiente"
  | "pago_vencido"
  | "ajuste_proximo"
  | "ajuste_hoy"
  | "proveedor_no_mapeado" {
  const m: Record<string, any> = {
    VENCIMIENTO_CONTRATO: "vencimiento_contrato",
    DECISION_PRORROGA: "decision_prorroga",
    PAGO_PENDIENTE: "pago_pendiente",
    PAGO_VENCIDO: "pago_vencido",
    AJUSTE_PROXIMO: "ajuste_proximo",
    AJUSTE_HOY: "ajuste_hoy",
    PROVEEDOR_NO_MAPEADO: "proveedor_no_mapeado",
  };
  const val = m[tipo];
  if (!val) throw new Error(`Tipo de alerta desconocido: "${tipo}"`);
  return val;
}
