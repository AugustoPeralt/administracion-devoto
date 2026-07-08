const ESTILOS = {
  ambar: "bg-amber-50 text-amber-700",
  rojo: "bg-rose-50 text-rose-700",
  verde: "bg-emerald-50 text-emerald-700",
  gris: "bg-slate-100 text-slate-600",
} as const;

export function Badge({
  children,
  color = "gris",
}: {
  children: React.ReactNode;
  color?: keyof typeof ESTILOS;
}) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[color]}`}>
      {children}
    </span>
  );
}
