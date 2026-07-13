import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alqAlertas,
  alqAlquileresMensuales,
  alqCanonVigenteConfig,
  alqContratos,
  alqDocumentos,
  alqLocales,
  alqLocalesMapping,
  alqSyncRuns,
} from "@/db/schema";
import { semaforoContrato, estadoPago } from "./status";

/** Última corrida de sincronización, sin importar el estado (para "última actualización"). */
export async function obtenerUltimaSyncAlquileres() {
  const [fila] = await db.select().from(alqSyncRuns).orderBy(desc(alqSyncRuns.id)).limit(1);
  return fila ?? null;
}

/** Id de la corrida más reciente que terminó (completado o con_errores) — las
 * alertas son un snapshot por corrida, la web solo lee la última. */
async function obtenerUltimoSyncRunIdCompleto(): Promise<number | null> {
  const [fila] = await db
    .select({ id: alqSyncRuns.id })
    .from(alqSyncRuns)
    .where(inArray(alqSyncRuns.estado, ["completado", "con_errores"]))
    .orderBy(desc(alqSyncRuns.id))
    .limit(1);
  return fila?.id ?? null;
}

// "Set" (no "Sep"): abreviatura real de septiembre en los CBC — ver mismo comentario en alertas.ts.
const MES_NUM: Record<string, number> = {
  Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Set: 9, Oct: 10, Nov: 11, Dic: 12,
};

/** Clave numérica año*100+mes para poder ordenar "Ene-26"/"Dic-25" cronológicamente
 * — ordenarlos como texto ("mes desc") da un orden alfabético que NO coincide con
 * el calendario (ej. "May-26" > "Jun-26" alfabéticamente). */
function claveMes(mes: string): number {
  const [m, y] = mes.split("-");
  return Number(y) * 100 + (MES_NUM[m] ?? 0);
}

function ordenarMeses(meses: string[]): string[] {
  return meses.sort((a, b) => claveMes(a) - claveMes(b));
}

interface FilaAlquilerMensual {
  local: string;
  mes: string;
  totalFacturado: number;
  totalPagado: number;
  saldo: number;
}

/** El AlquilerMensual cronológicamente más reciente por local (nunca por orden
 * alfabético del string "mes") — base de "canon mes actual" y CANON_VIGENTE. */
async function obtenerUltimoAlquilerPorLocal(soloLocalesReales: boolean): Promise<Map<string, FilaAlquilerMensual>> {
  const filas = await db
    .select({
      local: alqAlquileresMensuales.local,
      mes: alqAlquileresMensuales.mes,
      totalFacturado: alqAlquileresMensuales.totalFacturado,
      totalPagado: alqAlquileresMensuales.totalPagado,
      saldo: alqAlquileresMensuales.saldo,
    })
    .from(alqAlquileresMensuales);

  const ultimoPorLocal = new Map<string, FilaAlquilerMensual>();
  for (const f of filas) {
    // Los pseudo-locales del parser ("_DESCONOCIDO_...", "_OFICINA_ADMIN") arrancan
    // con "_" — filtrar acá en JS en vez de con LIKE, para no depender del escaping
    // de "_" (comodín de un carácter en SQL LIKE) en el template del driver.
    if (soloLocalesReales && f.local.startsWith("_")) continue;
    const actual = ultimoPorLocal.get(f.local);
    if (!actual || claveMes(f.mes) > claveMes(actual.mes)) {
      ultimoPorLocal.set(f.local, {
        local: f.local,
        mes: f.mes,
        totalFacturado: Number(f.totalFacturado),
        totalPagado: Number(f.totalPagado),
        saldo: Number(f.saldo),
      });
    }
  }
  return ultimoPorLocal;
}

export interface FiltroAlertas {
  prioridad?: string;
  local?: string;
  tipoAlerta?: string;
}

const ORDEN_PRIORIDAD: Record<string, number> = { critica: 0, urgente: 1, proxima: 2, informativa: 3 };

/** Alertas de la última corrida completa, opcionalmente filtradas. */
export async function obtenerAlertasVigentes(filtro?: FiltroAlertas) {
  const syncRunId = await obtenerUltimoSyncRunIdCompleto();
  if (syncRunId === null) return [];

  const condiciones = [eq(alqAlertas.syncRunId, syncRunId)];
  if (filtro?.prioridad) condiciones.push(eq(alqAlertas.prioridad, filtro.prioridad as any));
  if (filtro?.local) condiciones.push(eq(alqAlertas.local, filtro.local));
  if (filtro?.tipoAlerta) condiciones.push(eq(alqAlertas.tipoAlerta, filtro.tipoAlerta as any));

  const filas = await db
    .select()
    .from(alqAlertas)
    .where(and(...condiciones));

  return filas.sort((a, b) => {
    const pa = ORDEN_PRIORIDAD[a.prioridad] ?? 99;
    const pb = ORDEN_PRIORIDAD[b.prioridad] ?? 99;
    if (pa !== pb) return pa - pb;
    const fa = a.fechaEvento ?? "9999-12-31";
    const fb = b.fechaEvento ?? "9999-12-31";
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/** Lista de locales distintos que aparecen en alertas de la última corrida (para el filtro). */
export async function obtenerLocalesConAlertas(): Promise<string[]> {
  const syncRunId = await obtenerUltimoSyncRunIdCompleto();
  if (syncRunId === null) return [];
  const filas = await db
    .selectDistinct({ local: alqAlertas.local })
    .from(alqAlertas)
    .where(eq(alqAlertas.syncRunId, syncRunId))
    .orderBy(alqAlertas.local);
  return filas.map((f) => f.local);
}

export interface ResumenAlquileres {
  localesConContratoVigente: number;
  localesConDatosCbc: number;
  canonMesActual: number;
  saldoPendiente: number;
  alertasCriticas: number;
  alertasUrgentes: number;
  proximoVencimientoDias: number | null;
}

/** KPIs equivalentes a la hoja RESUMEN del Excel. */
export async function obtenerResumenAlquileres(): Promise<ResumenAlquileres> {
  const hoy = new Date();
  const hoyIso = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-${String(
    hoy.getUTCDate()
  ).padStart(2, "0")}`;

  const [{ count: localesVigentes }] = await db
    .select({ count: sql<number>`count(distinct ${alqContratos.localId})::int` })
    .from(alqContratos)
    .where(eq(alqContratos.estado, "vigente"));

  // Los pseudo-locales del parser ("_DESCONOCIDO_...", "_OFICINA_ADMIN") arrancan con
  // "_" — se filtran en JS (ver comentario en obtenerUltimoAlquilerPorLocal) en vez de
  // con LIKE, para no depender del escaping de "_" en el template del driver SQL.
  const todasLasFilas = await db
    .select({ local: alqAlquileresMensuales.local, saldo: alqAlquileresMensuales.saldo })
    .from(alqAlquileresMensuales);
  const filasReales = todasLasFilas.filter((f) => !f.local.startsWith("_"));

  const localesCbc = new Set(filasReales.map((f) => f.local)).size;
  const saldoPendiente = filasReales.reduce((acc, f) => {
    const saldo = Number(f.saldo);
    return saldo > 0 ? acc + saldo : acc;
  }, 0);

  // Último mes por local (no _internos) para sumar el canon del mes vigente.
  const ultimoPorLocal = await obtenerUltimoAlquilerPorLocal(true);
  const canonMesActual = [...ultimoPorLocal.values()].reduce((acc, f) => acc + f.totalFacturado, 0);

  const syncRunId = await obtenerUltimoSyncRunIdCompleto();
  let alertasCriticas = 0;
  let alertasUrgentes = 0;
  if (syncRunId !== null) {
    const conteos = await db
      .select({ prioridad: alqAlertas.prioridad, n: sql<number>`count(*)::int` })
      .from(alqAlertas)
      .where(eq(alqAlertas.syncRunId, syncRunId))
      .groupBy(alqAlertas.prioridad);
    alertasCriticas = conteos.find((c) => c.prioridad === "critica")?.n ?? 0;
    alertasUrgentes = conteos.find((c) => c.prioridad === "urgente")?.n ?? 0;
  }

  const [{ dias }] = await db
    .select({
      dias: sql<number | null>`min(${alqContratos.vencimiento}::date - ${hoyIso}::date)`,
    })
    .from(alqContratos)
    .where(and(eq(alqContratos.estado, "vigente"), sql`${alqContratos.vencimiento} is not null`));

  return {
    localesConContratoVigente: localesVigentes,
    localesConDatosCbc: localesCbc,
    canonMesActual,
    saldoPendiente,
    alertasCriticas,
    alertasUrgentes,
    proximoVencimientoDias: dias === null ? null : Number(dias),
  };
}

export interface CeldaPago {
  mes: string;
  totalFacturado: number;
  totalPagado: number;
  saldo: number;
  estado: ReturnType<typeof estadoPago>;
}

export interface FilaMatrizPagos {
  local: string;
  celdas: Record<string, CeldaPago>;
  totalFacturado: number;
  totalPagado: number;
  saldo: number;
}

/** Matriz local × mes equivalente a SEGUIMIENTO_PAGOS (excluye pseudo-locales "_..."). */
export async function obtenerMatrizPagos(): Promise<{ meses: string[]; filas: FilaMatrizPagos[] }> {
  const filas = await db
    .select({
      local: alqAlquileresMensuales.local,
      mes: alqAlquileresMensuales.mes,
      totalFacturado: alqAlquileresMensuales.totalFacturado,
      totalPagado: alqAlquileresMensuales.totalPagado,
      saldo: alqAlquileresMensuales.saldo,
    })
    .from(alqAlquileresMensuales);

  const mesesSet = new Set<string>();
  const porLocal = new Map<string, FilaMatrizPagos>();

  for (const f of filas) {
    if (f.local.startsWith("_")) continue;
    mesesSet.add(f.mes);
    let fila = porLocal.get(f.local);
    if (!fila) {
      fila = { local: f.local, celdas: {}, totalFacturado: 0, totalPagado: 0, saldo: 0 };
      porLocal.set(f.local, fila);
    }
    const totalFacturado = Number(f.totalFacturado);
    const totalPagado = Number(f.totalPagado);
    const saldo = Number(f.saldo);
    fila.celdas[f.mes] = { mes: f.mes, totalFacturado, totalPagado, saldo, estado: estadoPago(totalFacturado, totalPagado, saldo) };
    fila.totalFacturado += totalFacturado;
    fila.totalPagado += totalPagado;
    fila.saldo += saldo;
  }

  const meses = ordenarMeses([...mesesSet]);
  return { meses, filas: [...porLocal.values()].sort((a, b) => a.local.localeCompare(b.local)) };
}

export interface ContratoConSemaforo {
  id: number;
  local: string;
  contratoIdExcel: number;
  estado: string;
  tipo: string | null;
  domicilio: string | null;
  partes: string | null;
  vencimiento: string | null;
  plazo: string | null;
  valorMoneda: string | null;
  actualizacion: string | null;
  prorroga: string | null;
  voluntad: string | null;
  renegociacion: string | null;
  diasRestantes: number | null;
  semaforo: ReturnType<typeof semaforoContrato>;
}

/** Contratos con semáforo, vigentes primero (por vencimiento asc), luego el resto. */
export async function obtenerContratosConSemaforo(): Promise<ContratoConSemaforo[]> {
  const filas = await db
    .select({
      id: alqContratos.id,
      local: alqLocales.nombre,
      contratoIdExcel: alqContratos.contratoIdExcel,
      estado: alqContratos.estado,
      tipo: alqContratos.tipo,
      domicilio: alqContratos.domicilio,
      partes: alqContratos.partes,
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

  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());

  const conSemaforo: ContratoConSemaforo[] = filas.map((f) => {
    let diasRestantes: number | null = null;
    if (f.vencimiento) {
      const [y, m, d] = f.vencimiento.split("-").map(Number);
      diasRestantes = Math.round((Date.UTC(y, m - 1, d) - hoyUTC) / 86_400_000);
    }
    return {
      ...f,
      diasRestantes,
      semaforo: f.estado === "vigente" ? semaforoContrato(diasRestantes) : "S/F",
    };
  });

  const vigentes = conSemaforo
    .filter((c) => c.estado === "vigente")
    .sort((a, b) => (a.vencimiento ?? "9999-12-31").localeCompare(b.vencimiento ?? "9999-12-31"));
  const resto = conSemaforo.filter((c) => c.estado !== "vigente");
  return [...vigentes, ...resto];
}

export async function obtenerContratoPorId(id: number): Promise<ContratoConSemaforo | null> {
  const todos = await obtenerContratosConSemaforo();
  return todos.find((c) => c.id === id) ?? null;
}

export interface CanonVigenteFila {
  id: number;
  local: string;
  diaPagoDesde: number;
  diaPagoHasta: number;
  proximoAjuste: string | null;
  indiceAjuste: string | null;
  preavisoProrrogaDias: number;
  ultimoMes: string | null;
  canonVigente: number | null;
  estadoPago: ReturnType<typeof estadoPago> | null;
}

/** Config de canon vigente + último alquiler mensual conocido por local. */
export async function obtenerCanonVigente(): Promise<CanonVigenteFila[]> {
  const configs = await db.select().from(alqCanonVigenteConfig).orderBy(alqCanonVigenteConfig.local);
  const ultimoPorLocal = await obtenerUltimoAlquilerPorLocal(false);

  return configs.map((c) => {
    const ultimo = ultimoPorLocal.get(c.local);
    return {
      id: c.id,
      local: c.local,
      diaPagoDesde: c.diaPagoDesde,
      diaPagoHasta: c.diaPagoHasta,
      proximoAjuste: c.proximoAjuste,
      indiceAjuste: c.indiceAjuste,
      preavisoProrrogaDias: c.preavisoProrrogaDias,
      ultimoMes: ultimo?.mes ?? null,
      canonVigente: ultimo ? ultimo.totalFacturado : null,
      estadoPago: ultimo ? estadoPago(ultimo.totalFacturado, ultimo.totalPagado, ultimo.saldo) : null,
    };
  });
}

/** Locales conocidos (para poblar el <select> del form de canon vigente). */
export async function obtenerNombresLocales(): Promise<string[]> {
  const filas = await db.select({ nombre: alqLocales.nombre }).from(alqLocales).orderBy(alqLocales.nombre);
  return filas.map((f) => f.nombre);
}

export async function obtenerLocalesMapping() {
  return db.select().from(alqLocalesMapping).orderBy(alqLocalesMapping.proveedorCbc);
}

export async function obtenerDocumentos() {
  return db.select().from(alqDocumentos).orderBy(alqDocumentos.nombre);
}
