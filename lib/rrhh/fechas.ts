/** Utilidades de fecha para RRHH — mismo criterio que lib/alquileres/fechas.ts. */

/** "Hoy" en Argentina (UTC-3, sin horario de verano) como fecha pura en medianoche UTC.
 * Importa porque el cron corre a las 00:00 UTC = 21:00 ART del día anterior: sin este
 * ajuste, la sincronización escribiría en la columna del día siguiente en Nómina. */
export function hoyART(): Date {
  const ahora = new Date();
  const desplazado = new Date(ahora.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(desplazado.getUTCFullYear(), desplazado.getUTCMonth(), desplazado.getUTCDate()));
}

/** Convierte un Date (interpretado en UTC) a "YYYY-MM-DD". */
export function isoDeFecha(fecha: Date): string {
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Compara solo año/mes/día en UTC (ignora la hora, que en celdas Excel suele ser 00:00 igual). */
export function mismaFechaUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
