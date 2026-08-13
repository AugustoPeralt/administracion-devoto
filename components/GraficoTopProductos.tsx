import { formatoMoneda } from "@/lib/formato";
import { COLOR_GASTO_PRODUCTO } from "@/lib/control-precios/colores-graficos";

function formatoCantidad(cantidad: number): string {
  return cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Top de productos por gasto verificado — lista de ranking (nombre completo
 * en su propia línea + barra fina), no un bar chart de ejes: con nombres
 * reales de hasta ~80 caracteres, forzarlos en la columna angosta del eje Y
 * de un chart quedaba amontonado e ilegible para mostrar en una reunión. */
export function GraficoTopProductos({
  datos,
}: {
  datos: { productoNombre: string; gasto: number; cantidad: number; unidadMedida: string }[];
}) {
  if (datos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-slate-400">Sin compras verificadas en este período.</p>;
  }

  const maximo = Math.max(...datos.map((d) => d.gasto));

  return (
    <div className="space-y-4">
      {datos.map((d, i) => {
        const porcentaje = maximo > 0 ? (d.gasto / maximo) * 100 : 0;
        return (
          <div key={`${d.productoNombre}-${i}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-slate-900">
                <span className="mr-2 text-xs font-normal tabular-nums text-slate-400">{i + 1}</span>
                {d.productoNombre}
              </p>
              <span className="shrink-0 text-xs text-slate-500">
                {formatoCantidad(d.cantidad)} {d.unidadMedida}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${porcentaje}%`, backgroundColor: COLOR_GASTO_PRODUCTO }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                {formatoMoneda(d.gasto)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
