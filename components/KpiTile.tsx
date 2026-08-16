const COLOR_VALOR = {
  neutro: "text-slate-900",
  bueno: "text-emerald-600",
  malo: "text-rose-600",
  atencion: "text-amber-600",
} as const;

// Badge propio de la metric card (rounded-md + borde) — a propósito distinto
// del <Badge> genérico (rounded-full, sin borde) que usan las tablas: acá
// busca leerse como un chip de estado Tremor, no como una etiqueta de fila.
const COLOR_BADGE = {
  ambar: "border-amber-200 bg-amber-50 text-amber-700",
  rojo: "border-rose-200 bg-rose-50 text-rose-700",
  verde: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const;

/** Metric card estilo Tremor: label en mayúsculas pequeñas + badge de estado
 * opcional arriba a la derecha + valor grande en mono + subtítulo opcional
 * (ej. qué producto/proveedor explica el número, cuando el valor por sí solo
 * no alcanza para identificarlo). Sin sparkline/delta por ahora — no hay
 * series históricas guardadas para compararlas. */
export function KpiTile({
  label,
  valor,
  color = "neutro",
  badge,
  subtitulo,
}: {
  label: string;
  valor: string;
  color?: keyof typeof COLOR_VALOR;
  badge?: { texto: string; color: keyof typeof COLOR_BADGE };
  subtitulo?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        {badge && (
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${COLOR_BADGE[badge.color]}`}>
            {badge.texto}
          </span>
        )}
      </div>
      <p className={`mt-1 font-mono text-2xl font-bold tracking-tight ${COLOR_VALOR[color]}`}>{valor}</p>
      {subtitulo && <p className="mt-1 truncate text-xs text-slate-500">{subtitulo}</p>}
    </div>
  );
}
