import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cajas,
  conceptosEsperados,
  consistenciaSaldos,
  duplicadosRevisados,
  justificacionesAuditoria,
  movimientosCaja,
} from "@/db/schema";

/** neon-http a veces devuelve arrays de Postgres como texto "{a,b,c}" en vez de array JS. */
function comoArray(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String);
  if (typeof valor === "string") return valor.replace(/^\{|\}$/g, "").split(",");
  return [];
}

export type RangoTiempo = "dia" | "semana" | "mes" | "todo";

export const RANGOS: { valor: RangoTiempo; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Últimos 7 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo" },
];

function isoUTC(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

export function calcularRango(rango: RangoTiempo): { desde: string | null; hasta: string | null } {
  const hoy = new Date();
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const d = hoy.getUTCDate();

  if (rango === "dia") {
    const hoyIso = isoUTC(y, m, d);
    return { desde: hoyIso, hasta: hoyIso };
  }
  if (rango === "semana") {
    return { desde: isoUTC(y, m, d - 6), hasta: isoUTC(y, m, d) };
  }
  if (rango === "mes") {
    return { desde: isoUTC(y, m, 1), hasta: isoUTC(y, m, d) };
  }
  return { desde: null, hasta: null };
}

export interface ResumenCaja {
  id: number;
  nombre: string;
  tipo: "operativa" | "obra";
  archivoOrigen: string;
  ingresos: number;
  egresos: number;
  neto: number;
  ingresosUsd: number;
  egresosUsd: number;
  netoUsd: number;
  cantidadMovimientos: number;
  saldoActualArs: number;
  saldoActualUsd: number;
  pendientesJustificacion: number;
  justificados: number;
}

/** Resumen por caja para el dashboard general, filtrado por período. */
export async function obtenerResumenCajas(rango: RangoTiempo): Promise<ResumenCaja[]> {
  const { desde, hasta } = calcularRango(rango);
  const condicionesPeriodo = [];
  if (desde) condicionesPeriodo.push(gte(movimientosCaja.fecha, desde));
  if (hasta) condicionesPeriodo.push(lte(movimientosCaja.fecha, hasta));
  const filtroPeriodo = condicionesPeriodo.length > 0 ? and(...condicionesPeriodo) : undefined;

  const todasLasCajas = await db.select().from(cajas).orderBy(cajas.tipo, cajas.nombre);

  const agregados = await db
    .select({
      cajaId: movimientosCaja.cajaId,
      ingresos: sql<string>`coalesce(sum(case when tipo_movimiento = 'ingreso' then monto_ars else 0 end), 0)`,
      egresos: sql<string>`coalesce(sum(case when tipo_movimiento = 'egreso' then monto_ars else 0 end), 0)`,
      ingresosUsd: sql<string>`coalesce(sum(case when tipo_movimiento = 'ingreso' then monto_usd else 0 end), 0)`,
      egresosUsd: sql<string>`coalesce(sum(case when tipo_movimiento = 'egreso' then monto_usd else 0 end), 0)`,
      cantidad: sql<number>`count(*)::int`,
      pendientes: sql<number>`count(*) filter (where requiere_justificacion = true and not exists (
        select 1 from justificaciones_auditoria ja where ja.movimiento_id = movimientos_caja.id
      ))::int`,
      justificados: sql<number>`count(*) filter (where requiere_justificacion = true and exists (
        select 1 from justificaciones_auditoria ja where ja.movimiento_id = movimientos_caja.id
      ))::int`,
    })
    .from(movimientosCaja)
    .where(filtroPeriodo)
    .groupBy(movimientosCaja.cajaId);

  const agregadosPorCaja = new Map(agregados.map((a) => [a.cajaId, a]));

  const ultimosSaldos = await db.execute<{
    caja_id: number;
    saldo_acumulado_ars: string;
    saldo_acumulado_usd: string;
  }>(
    // Ojo: se ordena por fila_excel (posición real en la hoja), NO por fecha. El
    // saldo acumulado de Excel se arrastra por posición de fila, y hay cajas con
    // filas cargadas fuera de orden cronológico — ordenar por fecha ahí agarraría
    // una fila intermedia en vez del saldo final real.
    sql`select distinct on (caja_id) caja_id, saldo_acumulado_ars, saldo_acumulado_usd
        from movimientos_caja
        order by caja_id, fila_excel desc`
  );
  const filasUltimosSaldos = Array.isArray(ultimosSaldos) ? ultimosSaldos : ultimosSaldos.rows;
  const saldoPorCaja = new Map(filasUltimosSaldos.map((r) => [r.caja_id, r]));

  return todasLasCajas.map((caja) => {
    const agg = agregadosPorCaja.get(caja.id);
    const saldo = saldoPorCaja.get(caja.id);
    const ingresos = agg ? Number(agg.ingresos) : 0;
    const egresos = agg ? Number(agg.egresos) : 0;
    const ingresosUsd = agg ? Number(agg.ingresosUsd) : 0;
    const egresosUsd = agg ? Number(agg.egresosUsd) : 0;
    return {
      id: caja.id,
      nombre: caja.nombre,
      tipo: caja.tipo,
      archivoOrigen: caja.archivoOrigen,
      ingresos,
      egresos,
      neto: ingresos + egresos,
      ingresosUsd,
      egresosUsd,
      netoUsd: ingresosUsd + egresosUsd,
      cantidadMovimientos: agg?.cantidad ?? 0,
      saldoActualArs: saldo ? Number(saldo.saldo_acumulado_ars) : 0,
      saldoActualUsd: saldo ? Number(saldo.saldo_acumulado_usd) : 0,
      pendientesJustificacion: agg?.pendientes ?? 0,
      justificados: agg?.justificados ?? 0,
    };
  });
}

export async function obtenerCajaPorId(cajaId: number) {
  const [caja] = await db.select().from(cajas).where(eq(cajas.id, cajaId)).limit(1);
  return caja ?? null;
}

export async function obtenerTodasLasCajas() {
  return db.select().from(cajas).orderBy(cajas.tipo, cajas.nombre);
}

export interface MovimientoConJustificacion {
  id: number;
  filaExcel: number;
  fecha: string;
  descripcionFinal: string;
  montoArs: string;
  montoUsd: string | null;
  tipoMovimiento: "ingreso" | "egreso";
  saldoAcumuladoArs: string | null;
  formulaOriginal: string | null;
  requiereJustificacion: boolean;
  anomalia: string | null;
  comentarioJustificacion: string | null;
}

export interface FiltroMovimientos {
  /** Un día puntual (YYYY-MM-DD) — tiene prioridad sobre "dias" si ambos vienen. */
  fecha?: string;
  /** Últimos N días contando desde hoy (incluido). */
  dias?: number;
}

export async function obtenerMovimientosPorCaja(
  cajaId: number,
  orden: "asc" | "desc" = "desc",
  filtro?: FiltroMovimientos
): Promise<MovimientoConJustificacion[]> {
  const ordenar = orden === "desc" ? desc : asc;
  const condiciones = [eq(movimientosCaja.cajaId, cajaId)];

  if (filtro?.fecha) {
    condiciones.push(eq(movimientosCaja.fecha, filtro.fecha));
  } else if (filtro?.dias && filtro.dias > 0) {
    const hoy = new Date();
    const desde = new Date(
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - (filtro.dias - 1))
    );
    condiciones.push(gte(movimientosCaja.fecha, desde.toISOString().slice(0, 10)));
  }

  const filas = await db
    .select({
      id: movimientosCaja.id,
      filaExcel: movimientosCaja.filaExcel,
      fecha: movimientosCaja.fecha,
      descripcionFinal: movimientosCaja.descripcionFinal,
      montoArs: movimientosCaja.montoArs,
      montoUsd: movimientosCaja.montoUsd,
      tipoMovimiento: movimientosCaja.tipoMovimiento,
      saldoAcumuladoArs: movimientosCaja.saldoAcumuladoArs,
      formulaOriginal: movimientosCaja.formulaOriginal,
      requiereJustificacion: movimientosCaja.requiereJustificacion,
      anomalia: movimientosCaja.anomalia,
      comentarioJustificacion: justificacionesAuditoria.comentario,
    })
    .from(movimientosCaja)
    .leftJoin(justificacionesAuditoria, eq(justificacionesAuditoria.movimientoId, movimientosCaja.id))
    .where(and(...condiciones))
    .orderBy(ordenar(movimientosCaja.fecha), ordenar(movimientosCaja.filaExcel));

  return filas;
}

export interface AjusteConJustificacion extends MovimientoConJustificacion {
  cajaId: number;
  cajaNombre: string;
  archivoOrigen: string;
  justificadoPor: string | null;
  justificadoEn: Date | null;
}

export type EstadoAjuste = "pendientes" | "justificados" | "todos";

/** Movimientos con requiere_justificacion=true, filtrados por estado (pendiente/justificado/todos). */
export async function obtenerAjustesOcultos(
  estado: EstadoAjuste,
  cajaId?: number
): Promise<AjusteConJustificacion[]> {
  const condiciones = [eq(movimientosCaja.requiereJustificacion, true)];
  if (cajaId !== undefined) condiciones.push(eq(movimientosCaja.cajaId, cajaId));
  if (estado === "pendientes") condiciones.push(isNull(justificacionesAuditoria.id));
  if (estado === "justificados") condiciones.push(sql`${justificacionesAuditoria.id} is not null`);

  const query = db
    .select({
      id: movimientosCaja.id,
      cajaId: movimientosCaja.cajaId,
      cajaNombre: cajas.nombre,
      archivoOrigen: movimientosCaja.archivoOrigen,
      filaExcel: movimientosCaja.filaExcel,
      fecha: movimientosCaja.fecha,
      descripcionFinal: movimientosCaja.descripcionFinal,
      montoArs: movimientosCaja.montoArs,
      montoUsd: movimientosCaja.montoUsd,
      tipoMovimiento: movimientosCaja.tipoMovimiento,
      saldoAcumuladoArs: movimientosCaja.saldoAcumuladoArs,
      formulaOriginal: movimientosCaja.formulaOriginal,
      requiereJustificacion: movimientosCaja.requiereJustificacion,
      anomalia: movimientosCaja.anomalia,
      comentarioJustificacion: justificacionesAuditoria.comentario,
      justificadoPor: justificacionesAuditoria.usuarioEmail,
      justificadoEn: justificacionesAuditoria.creadoEn,
    })
    .from(movimientosCaja)
    .innerJoin(cajas, eq(cajas.id, movimientosCaja.cajaId))
    .leftJoin(justificacionesAuditoria, eq(justificacionesAuditoria.movimientoId, movimientosCaja.id))
    .where(and(...condiciones))
    .orderBy(desc(movimientosCaja.fecha));

  return query;
}

export interface MovimientoConAnomalia {
  id: number;
  cajaId: number;
  cajaNombre: string;
  archivoOrigen: string;
  filaExcel: number;
  fecha: string;
  descripcionFinal: string;
  montoArs: string;
  anomalia: string;
}

export async function obtenerAnomalias(): Promise<MovimientoConAnomalia[]> {
  const filas = await db
    .select({
      id: movimientosCaja.id,
      cajaId: movimientosCaja.cajaId,
      cajaNombre: cajas.nombre,
      archivoOrigen: movimientosCaja.archivoOrigen,
      filaExcel: movimientosCaja.filaExcel,
      fecha: movimientosCaja.fecha,
      descripcionFinal: movimientosCaja.descripcionFinal,
      montoArs: movimientosCaja.montoArs,
      anomalia: movimientosCaja.anomalia,
    })
    .from(movimientosCaja)
    .innerJoin(cajas, eq(cajas.id, movimientosCaja.cajaId))
    .where(sql`${movimientosCaja.anomalia} is not null`)
    .orderBy(desc(movimientosCaja.fecha));

  return filas as MovimientoConAnomalia[];
}

export interface ConsistenciaCaja {
  cajaId: number;
  cajaNombre: string;
  archivoOrigen: string;
  saldoCalculadoArs: string;
  saldoExcelArs: string | null;
  diferenciaArs: string | null;
  filaTotalesEncontrada: boolean;
  verificadoEn: Date;
}

/** Comparación saldo recalculado vs. TOTAL $ de Excel, por caja (para detectar errores del Excel original). */
export async function obtenerConsistenciaSaldos(): Promise<ConsistenciaCaja[]> {
  const filas = await db
    .select({
      cajaId: consistenciaSaldos.cajaId,
      cajaNombre: cajas.nombre,
      archivoOrigen: cajas.archivoOrigen,
      saldoCalculadoArs: consistenciaSaldos.saldoCalculadoArs,
      saldoExcelArs: consistenciaSaldos.saldoExcelArs,
      diferenciaArs: consistenciaSaldos.diferenciaArs,
      filaTotalesEncontrada: consistenciaSaldos.filaTotalesEncontrada,
      verificadoEn: consistenciaSaldos.verificadoEn,
    })
    .from(consistenciaSaldos)
    .innerJoin(cajas, eq(cajas.id, consistenciaSaldos.cajaId))
    .orderBy(cajas.tipo, cajas.nombre);

  return filas;
}

export interface ConceptoEsperado {
  id: number;
  cajaId: number;
  cajaNombre: string;
  cajaTipo: "operativa" | "obra";
  nombre: string;
  codTitular: number | null;
  codCuenta: number | null;
  activo: boolean;
}

/** Reglas de pagos recurrentes configuradas, con la caja a la que pertenecen. */
export async function obtenerConceptosEsperados(): Promise<ConceptoEsperado[]> {
  return db
    .select({
      id: conceptosEsperados.id,
      cajaId: conceptosEsperados.cajaId,
      cajaNombre: cajas.nombre,
      cajaTipo: cajas.tipo,
      nombre: conceptosEsperados.nombre,
      codTitular: conceptosEsperados.codTitular,
      codCuenta: conceptosEsperados.codCuenta,
      activo: conceptosEsperados.activo,
    })
    .from(conceptosEsperados)
    .innerJoin(cajas, eq(cajas.id, conceptosEsperados.cajaId))
    .orderBy(cajas.tipo, cajas.nombre, conceptosEsperados.nombre);
}

/**
 * Pagos recurrentes activos que todavía NO aparecen cargados este mes (por código
 * de titular o de cuenta, según cómo esté configurada cada regla). No corrige ni
 * asume nada — solo señala para que la dirección confirme si ya se pagó y falta
 * cargar, o directamente no se pagó.
 */
export async function obtenerAlertasMesActual(): Promise<ConceptoEsperado[]> {
  const { desde, hasta } = calcularRango("mes");
  const conceptos = (await obtenerConceptosEsperados()).filter((c) => c.activo);
  if (conceptos.length === 0) return [];

  const condicionesPeriodo = and(gte(movimientosCaja.fecha, desde!), lte(movimientosCaja.fecha, hasta!));

  const [presentesTitular, presentesCuenta] = await Promise.all([
    db
      .select({ cajaId: movimientosCaja.cajaId, codTitular: movimientosCaja.codTitular })
      .from(movimientosCaja)
      .where(condicionesPeriodo)
      .groupBy(movimientosCaja.cajaId, movimientosCaja.codTitular),
    db
      .select({ cajaId: movimientosCaja.cajaId, codCuenta: movimientosCaja.codCuenta })
      .from(movimientosCaja)
      .where(condicionesPeriodo)
      .groupBy(movimientosCaja.cajaId, movimientosCaja.codCuenta),
  ]);

  const setTitular = new Set(presentesTitular.map((r) => `${r.cajaId}::${r.codTitular}`));
  const setCuenta = new Set(presentesCuenta.map((r) => `${r.cajaId}::${r.codCuenta}`));

  return conceptos.filter((c) => {
    if (c.codTitular !== null) return !setTitular.has(`${c.cajaId}::${c.codTitular}`);
    if (c.codCuenta !== null) return !setCuenta.has(`${c.cajaId}::${c.codCuenta}`);
    return false;
  });
}

/** Fecha de la última vez que se importaron datos (local o SharePoint), para mostrar en el dashboard. */
export async function obtenerUltimaSincronizacion(): Promise<Date | null> {
  const result: any = await db.execute(
    sql`select max(fecha_carga) as ultima from registro_auditoria where accion_tomada = 'importado'`
  );
  const rows = Array.isArray(result) ? result : result.rows;
  return rows[0]?.ultima ? new Date(rows[0].ultima) : null;
}

export interface MovimientoDuplicado {
  id: number;
  filaExcel: number;
  montoArs: string;
}

export interface CasoDuplicado {
  cajaId: number;
  cajaNombre: string;
  fecha: string;
  codTitular: number;
  titular: string;
  movimientos: MovimientoDuplicado[];
  montosIguales: boolean;
  estado: "pendiente" | "confirmado" | "justificado";
  comentario: string | null;
  usuarioEmail: string | null;
  fechaResolucion: Date | null;
}

export type EstadoDuplicado = "pendientes" | "confirmados" | "justificados" | "todos";

/**
 * Detecta "posibles duplicados": mismo concepto (código de titular), misma caja,
 * misma fecha, cargado más de una vez en filas SEPARADAS de la hoja (más de 3 filas
 * de distancia) — eso descarta el caso normal de dos ventas del mismo tipo cargadas
 * juntas ese día, y deja el patrón real de una re-carga que no borró la original.
 */
export async function obtenerPosiblesDuplicados(estadoFiltro: EstadoDuplicado = "pendientes"): Promise<CasoDuplicado[]> {
  const result: any = await db.execute(sql`
    select
      c.id as caja_id,
      c.nombre as caja_nombre,
      m.fecha::text as fecha,
      m.cod_titular,
      m.titular_resuelto,
      array_agg(m.id order by m.fila_excel) as movimiento_ids,
      array_agg(m.fila_excel order by m.fila_excel) as filas,
      array_agg(m.monto_ars::numeric order by m.fila_excel) as montos
    from movimientos_caja m
    join cajas c on c.id = m.caja_id
    where c.tipo = 'operativa' and m.cod_titular is not null
    group by c.id, c.nombre, m.fecha, m.cod_titular, m.titular_resuelto
    having count(*) > 1 and (max(m.fila_excel) - min(m.fila_excel)) > 3
    order by c.nombre, m.fecha
  `);
  const candidatos: any[] = Array.isArray(result) ? result : result.rows;

  const resoluciones = await db.select().from(duplicadosRevisados);
  const resolucionPorClave = new Map(
    resoluciones.map((r) => [`${r.cajaId}::${r.fecha}::${r.codTitular}`, r])
  );

  const casos: CasoDuplicado[] = candidatos.map((c) => {
    const clave = `${c.caja_id}::${c.fecha}::${c.cod_titular}`;
    const resolucion = resolucionPorClave.get(clave);
    const ids = comoArray(c.movimiento_ids);
    const filas = comoArray(c.filas);
    const montos = comoArray(c.montos);

    return {
      cajaId: c.caja_id,
      cajaNombre: c.caja_nombre,
      fecha: c.fecha,
      codTitular: c.cod_titular,
      titular: c.titular_resuelto ?? String(c.cod_titular),
      movimientos: filas.map((fila, i) => ({
        id: Number(ids[i]),
        filaExcel: Number(fila),
        montoArs: montos[i],
      })),
      montosIguales: new Set(montos).size === 1,
      estado: (resolucion?.estado as "confirmado" | "justificado" | undefined) ?? "pendiente",
      comentario: resolucion?.comentario ?? null,
      usuarioEmail: resolucion?.usuarioEmail ?? null,
      fechaResolucion: resolucion?.creadoEn ?? null,
    };
  });

  if (estadoFiltro === "todos") return casos;
  if (estadoFiltro === "pendientes") return casos.filter((c) => c.estado === "pendiente");
  if (estadoFiltro === "confirmados") return casos.filter((c) => c.estado === "confirmado");
  return casos.filter((c) => c.estado === "justificado");
}
