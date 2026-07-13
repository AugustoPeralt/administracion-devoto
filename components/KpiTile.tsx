const COLOR_VALOR = {
  neutro: "text-slate-950",
  bueno: "text-emerald-600",
  malo: "text-rose-600",
  atencion: "text-amber-600",
} as const;

/** Stat tile: label (sentence case, sin dos puntos) + value grande. Sin sparkline/delta
 * por ahora — no hay series históricas guardadas para compararlas. */
export function KpiTile({
  label,
  valor,
  color = "neutro",
}: {
  label: string;
  valor: string;
  color?: keyof typeof COLOR_VALOR;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${COLOR_VALOR[color]}`}>{valor}</p>
    </div>
  );
}
