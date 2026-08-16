import { formatoMoneda } from "@/lib/formato";

/** Ranking de gasto verificado por proveedor — lista de barras (Tremor
 * BarList: pista gris + barra sólida), no un chart de ejes — es un orden de
 * magnitud, no una comparación de series con identidad propia; el nombre a la
 * izquierda ya identifica cada barra. Mismo patrón que GraficoTopProductos. */
export function GraficoGastoPorProveedor({ datos }: { datos: { proveedorNombre: string; gasto: number }[] }) {
  if (datos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-slate-400">Sin compras verificadas en este período.</p>;
  }

  const maximo = Math.max(...datos.map((d) => d.gasto));

  return (
    <div className="space-y-4">
      {datos.map((d) => {
        const porcentaje = maximo > 0 ? (d.gasto / maximo) * 100 : 0;
        return (
          <div key={d.proveedorNombre}>
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <p className="truncate text-sm font-medium text-slate-900">{d.proveedorNombre}</p>
              <span className="shrink-0 font-mono text-sm font-semibold text-slate-900">
                {formatoMoneda(d.gasto)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-800" style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
