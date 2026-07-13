import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { alquileresEfectivo, movimientosCaja, cajas } from "@/db/schema";
import { calcularRango } from "./queries";

/**
 * Alquileres pagados en efectivo (cod_titular=3 en Consolidados) — ver comentario
 * en db/schema.ts sobre por qué se matchea por texto libre en vez de por código
 * (todos comparten el mismo código genérico "ALQUILER LOCAL"/"Sin Titular 3").
 */

export interface PagoAlquilerEfectivo {
  fecha: string;
  monto: number;
  descripcion: string;
}

export interface AlquilerEfectivoInfo {
  id: number;
  cajaId: number;
  cajaNombre: string;
  nombre: string;
  palabrasClave: string[];
  activo: boolean;
  pagos: PagoAlquilerEfectivo[];
  ultimoPago: PagoAlquilerEfectivo | null;
  pagadoEsteMes: boolean;
  /** Fechas donde el monto cambió >1% respecto al pago anterior — cada una es un "ajuste". */
  fechasAjuste: string[];
  promedioIntervaloDiasAjuste: number | null;
  proximaActualizacionEstimada: string | null;
  diasDesdeUltimoAjuste: number | null;
}

export interface CajaSinClasificar {
  cajaNombre: string;
  pagos: PagoAlquilerEfectivo[];
}

const TOLERANCIA_CAMBIO = 0.01; // 1%: por debajo se considera "mismo monto" (redondeos)

function esCambioDeMonto(actual: number, anterior: number): boolean {
  if (anterior === 0) return actual !== 0;
  return Math.abs(actual - anterior) / Math.abs(anterior) > TOLERANCIA_CAMBIO;
}

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Reglas activas (+ catch-all) agrupadas por caja, con matching de keywords ya resuelto. */
export async function obtenerAlquileresEfectivo(): Promise<{
  alquileres: AlquilerEfectivoInfo[];
  sinClasificar: CajaSinClasificar[];
}> {
  const reglas = await db
    .select({
      id: alquileresEfectivo.id,
      cajaId: alquileresEfectivo.cajaId,
      cajaNombre: cajas.nombre,
      nombre: alquileresEfectivo.nombre,
      codTitular: alquileresEfectivo.codTitular,
      palabrasClave: alquileresEfectivo.palabrasClave,
      activo: alquileresEfectivo.activo,
    })
    .from(alquileresEfectivo)
    .innerJoin(cajas, eq(cajas.id, alquileresEfectivo.cajaId))
    .where(eq(alquileresEfectivo.activo, true));

  if (reglas.length === 0) return { alquileres: [], sinClasificar: [] };

  const cajaIds = [...new Set(reglas.map((r) => r.cajaId))];
  const codTitulares = [...new Set(reglas.map((r) => r.codTitular))];

  // Todos los movimientos cod_titular en juego, de las cajas con reglas configuradas.
  const movimientos = await db
    .select({
      cajaId: movimientosCaja.cajaId,
      codTitular: movimientosCaja.codTitular,
      fecha: movimientosCaja.fecha,
      montoArs: movimientosCaja.montoArs,
      descripcionFinal: movimientosCaja.descripcionFinal,
      conceptoManual: movimientosCaja.conceptoManual,
    })
    .from(movimientosCaja)
    .where(and(isNotNull(movimientosCaja.codTitular)));

  const { desde, hasta } = calcularRango("mes");

  const reglasPorCaja = new Map<number, typeof reglas>();
  for (const r of reglas) {
    (reglasPorCaja.get(r.cajaId) ?? reglasPorCaja.set(r.cajaId, []).get(r.cajaId)!).push(r);
  }

  const pagosPorRegla = new Map<number, PagoAlquilerEfectivo[]>();
  const sinClasificarPorCaja = new Map<string, PagoAlquilerEfectivo[]>();

  for (const m of movimientos) {
    if (!cajaIds.includes(m.cajaId) || !codTitulares.includes(m.codTitular!)) continue;
    const reglasCaja = (reglasPorCaja.get(m.cajaId) ?? []).filter((r) => r.codTitular === m.codTitular);
    if (reglasCaja.length === 0) continue;

    const texto = `${m.descripcionFinal} ${m.conceptoManual ?? ""}`.toLowerCase();
    const pago: PagoAlquilerEfectivo = {
      fecha: m.fecha,
      monto: Math.abs(Number(m.montoArs)),
      descripcion: m.descripcionFinal,
    };

    const especificas = reglasCaja.filter((r) => r.palabrasClave.trim() !== "");
    const match = especificas.find((r) =>
      r.palabrasClave.split(",").some((kw) => kw.trim() && texto.includes(kw.trim().toLowerCase()))
    );

    if (match) {
      (pagosPorRegla.get(match.id) ?? pagosPorRegla.set(match.id, []).get(match.id)!).push(pago);
      continue;
    }

    const catchAll = reglasCaja.find((r) => r.palabrasClave.trim() === "");
    if (catchAll) {
      (pagosPorRegla.get(catchAll.id) ?? pagosPorRegla.set(catchAll.id, []).get(catchAll.id)!).push(pago);
      continue;
    }

    const cajaNombre = reglasCaja[0].cajaNombre;
    (sinClasificarPorCaja.get(cajaNombre) ?? sinClasificarPorCaja.set(cajaNombre, []).get(cajaNombre)!).push(pago);
  }

  const alquileres: AlquilerEfectivoInfo[] = reglas.map((r) => {
    const pagos = (pagosPorRegla.get(r.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimoPago = pagos.at(-1) ?? null;
    const pagadoEsteMes = pagos.some((p) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));

    const fechasAjuste: string[] = [];
    for (let i = 1; i < pagos.length; i++) {
      if (esCambioDeMonto(pagos[i].monto, pagos[i - 1].monto)) fechasAjuste.push(pagos[i].fecha);
    }
    const intervalos: number[] = [];
    for (let i = 1; i < fechasAjuste.length; i++) {
      intervalos.push(diasEntre(fechasAjuste[i], fechasAjuste[i - 1]));
    }
    const promedioIntervaloDiasAjuste =
      intervalos.length > 0 ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length) : null;

    const ultimoAjuste = fechasAjuste.at(-1) ?? null;
    const hoyIso = new Date().toISOString().slice(0, 10);
    const diasDesdeUltimoAjuste = ultimoAjuste ? diasEntre(hoyIso, ultimoAjuste) : null;
    const proximaActualizacionEstimada =
      ultimoAjuste && promedioIntervaloDiasAjuste
        ? new Date(
            new Date(`${ultimoAjuste}T00:00:00Z`).getTime() + promedioIntervaloDiasAjuste * 86_400_000
          )
            .toISOString()
            .slice(0, 10)
        : null;

    return {
      id: r.id,
      cajaId: r.cajaId,
      cajaNombre: r.cajaNombre,
      nombre: r.nombre,
      palabrasClave: r.palabrasClave.split(",").map((k) => k.trim()).filter(Boolean),
      activo: r.activo,
      pagos,
      ultimoPago,
      pagadoEsteMes,
      fechasAjuste,
      promedioIntervaloDiasAjuste,
      proximaActualizacionEstimada,
      diasDesdeUltimoAjuste,
    };
  });

  const sinClasificar: CajaSinClasificar[] = [...sinClasificarPorCaja.entries()].map(([cajaNombre, pagos]) => ({
    cajaNombre,
    pagos: pagos.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  }));

  return { alquileres, sinClasificar };
}
