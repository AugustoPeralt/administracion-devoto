import type { FilaDeltaPrecio } from "@/lib/control-precios/consultas";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { VisorFacturaDrawer } from "@/components/VisorFacturaDrawer";
import Link from "next/link";

/** Tabla plana (sin agrupar por proveedor) de los productos con aumento ≥
 * umbralAlerta — mismo array `alertas` que ya calcula page.tsx para el KPI
 * "Alertas", solo que acá se muestran de entrada en vez de quedar mezcladas
 * entre el resto de los productos dentro de TablaDeltaPreciosPorProveedor. */
export function TablaAlertasPrecio({ alertas, umbralAlerta }: { alertas: FilaDeltaPrecio[]; umbralAlerta: number }) {
  if (alertas.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        Sin aumentos ≥{umbralAlerta}% en el período con los filtros elegidos.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/75 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Restaurante</th>
              <th className="px-3 py-2 text-right">Precio anterior</th>
              <th className="px-3 py-2 text-right">Precio actual</th>
              <th className="px-3 py-2 text-right">Aumento</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {alertas.map((d) => (
              <tr
                key={`${d.productoId}-${d.localId ?? "sin-local"}`}
                className="border-t border-slate-100 hover:bg-slate-50/80"
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{d.productoNombre}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{d.proveedorNombre}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{d.localNombre ?? "Sin asignar"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  <div className="tabular-nums text-slate-500">
                    {d.precioBase ? formatoMoneda(d.precioBase) : "—"}
                  </div>
                  {d.fechaBase && <div className="text-xs text-slate-400">{formatoFecha(d.fechaBase)}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  <div className="tabular-nums text-slate-900">{formatoMoneda(d.precioActual)}</div>
                  <div className="text-xs text-slate-400">{formatoFecha(d.fechaActual)}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Badge color="rojo">+{d.porcentajeAumento}%</Badge>
                  {d.precioBase && (
                    <div className="mt-1 font-mono text-[11px] tabular-nums text-rose-600">
                      +{formatoMoneda(Number(d.precioActual) - Number(d.precioBase))}/{d.unidadMedida}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <VisorFacturaDrawer facturaId={d.facturaIdActual} />
                    <span className="text-slate-300">·</span>
                    <Link
                      href={`/control-precios/facturas/${d.facturaIdActual}`}
                      className="text-xs text-slate-500 underline hover:text-slate-900"
                    >
                      Corregir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
