/** Convierte un texto de input a número aceptando tanto "7291.5" como "7291,5"
 * (coma decimal, formato habitual al tipear en es-AR) — devuelve NaN si no es un
 * número válido, igual que Number(). */
export function parseNumeroDecimal(texto: string | undefined): number {
  if (texto === undefined) return NaN;
  return Number(texto.trim().replace(",", "."));
}

export function formatoMoneda(valor: number | string | null, moneda: "ARS" | "USD" = "ARS"): string {
  if (valor === null) return "-";
  const num = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatoFecha(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(`${fecha}T00:00:00Z`) : fecha;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Formatea un "YYYY-MM" (ej. de obtenerAlertasHistoricas) como "julio 2026". */
export function formatoMesAnio(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Corta un texto largo con "…" — para labels de eje en gráficos, donde un
 * nombre de producto/proveedor real puede superar los 70 caracteres y no hay
 * espacio para mostrarlo entero. El valor completo sigue disponible en el
 * tooltip (no pasa por acá). */
export function truncarTexto(texto: string, maximo: number): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

export function formatoFechaHora(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // Explícito a propósito: sin esto, el resultado depende del huso horario del
    // servidor que corre el código. Anda "bien" en local porque la máquina está en
    // hora Argentina, pero se rompería al desplegar a Vercel (corre en UTC).
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);
}
