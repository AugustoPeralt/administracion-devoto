/** Utilidades de fecha en UTC para alertas.ts — evita bugs de huso horario al
 * operar sobre fechas "puras" (sin hora) como hace Python con `datetime.date`. */

/** Parsea "YYYY-MM-DD" a Date en medianoche UTC. */
export function fechaUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Convierte un Date (interpretado en UTC) a "YYYY-MM-DD". */
export function isoDeFecha(fecha: Date): string {
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Mirror de `(fechaIso_como_date - base).days` en Python. */
export function diasEntre(fechaIso: string, base: Date): number {
  return Math.round((fechaUTC(fechaIso).getTime() - base.getTime()) / 86_400_000);
}

/** Mirror de `base + timedelta(days=dias)`. */
export function sumarDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 86_400_000);
}

/** Mirror de `base.replace(day=dia)`: mismo año/mes de `base`, día reemplazado. */
export function conDia(base: Date, dia: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dia));
}

/** `hoy` en medianoche UTC (evita que la hora local corra la fecha). */
export function hoyUTC(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
}
