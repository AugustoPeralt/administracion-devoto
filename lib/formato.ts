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
