import { formatoFecha, formatoMoneda } from "@/lib/formato";
import Link from "next/link";

export type RenglonSinVerificar = {
  productoNombre: string;
  proveedorNombre: string;
  unidadMedida: string;
  localNombre: string | null;
  facturaId: number;
  fechaEmision: string;
  cantidad: string;
  subtotalCalculado: string | null;
  subtotalImpreso: string | null;
};

function formatoCantidad(cantidad: number): string {
  return cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Tabla plana de renglones con descuento propio que no reconcilian contra el
 * subtotal impreso en el papel (o no tienen subtotal impreso para comparar) —
 * mismo dato que ya alimenta el banner ámbar y los badges "sin verificar" de
 * TablaHistorialCompras (ver `compras[].verificado === false` en
 * obtenerHistorialComprasPorProducto), acá listado aparte para que no quede
 * escondido dentro del detalle expandible de cada producto. */
export function TablaRenglonesSinVerificar({ renglones }: { renglones: RenglonSinVerificar[] }) {
  if (renglones.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        Sin renglones pendientes de verificar en el período con los filtros elegidos.
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
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Subtotal calculado</th>
              <th className="px-3 py-2 text-right">Subtotal impreso</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r, i) => (
              <tr key={`${r.facturaId}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{r.productoNombre}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.proveedorNombre}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.localNombre ?? "Sin asignar"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatoFecha(r.fechaEmision)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                  {formatoCantidad(Number(r.cantidad))} {r.unidadMedida}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                  {r.subtotalCalculado !== null ? formatoMoneda(r.subtotalCalculado) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-amber-700">
                  {r.subtotalImpreso !== null ? formatoMoneda(r.subtotalImpreso) : "sin dato"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Link
                    href={`/control-precios/facturas/${r.facturaId}`}
                    className="text-xs text-slate-500 underline hover:text-slate-900"
                  >
                    Corregir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
