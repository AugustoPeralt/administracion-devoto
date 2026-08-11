import { FacturasFechaSospechosaPanel } from "@/components/FacturasFechaSospechosaPanel";
import { FacturasNumeroRepetidoPanel } from "@/components/FacturasNumeroRepetidoPanel";
import { FusionarProductosPanel } from "@/components/FusionarProductosPanel";
import { FusionarProveedoresPanel } from "@/components/FusionarProveedoresPanel";
import { ItemsPendientesDePrecioPanel } from "@/components/ItemsPendientesDePrecioPanel";
import { ItemsPrecioCeroPanel } from "@/components/ItemsPrecioCeroPanel";
import { formatoMoneda } from "@/lib/formato";
import {
  agruparPosiblesDuplicados,
  agruparPosiblesProductosDuplicados,
  obtenerFacturasConFechaSospechosa,
  obtenerFacturasPosibleDuplicado,
  obtenerItemsPendientesDePrecio,
  obtenerItemsPrecioCero,
  obtenerProductosConTotales,
  obtenerProveedoresConTotales,
} from "@/lib/control-precios/consultas";

export default async function ProveedoresPage() {
  const [proveedores, productos, facturasSospechosas, facturasDuplicadas, itemsPendientes, itemsPrecioCero] =
    await Promise.all([
      obtenerProveedoresConTotales(),
      obtenerProductosConTotales(),
      obtenerFacturasConFechaSospechosa(),
      obtenerFacturasPosibleDuplicado(),
      obtenerItemsPendientesDePrecio(),
      obtenerItemsPrecioCero(),
    ]);
  const gruposProveedores = agruparPosiblesDuplicados(proveedores);
  const gruposProductos = agruparPosiblesProductosDuplicados(productos);

  const sinAlertas =
    gruposProveedores.length === 0 &&
    gruposProductos.length === 0 &&
    facturasSospechosas.length === 0 &&
    facturasDuplicadas.length === 0 &&
    itemsPendientes.length === 0 &&
    itemsPrecioCero.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Calidad de datos</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Todo lo que se cargó de forma rara o incompleta aparece acá: proveedores o productos duplicados, fechas que
          no cuadran e ítems sin precio real. Nada se corrige solo — cada corrección la confirmás vos. La revisión de
          cada factura (foto + datos editables) pasa por la pantalla de carga, no por acá.
        </p>
      </div>

      {sinAlertas && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-800">
          Sin alertas por ahora — los datos cargados están consistentes.
        </p>
      )}

      <ItemsPendientesDePrecioPanel items={itemsPendientes} />
      <ItemsPrecioCeroPanel items={itemsPrecioCero} />
      <FacturasFechaSospechosaPanel facturas={facturasSospechosas} />
      <FacturasNumeroRepetidoPanel grupos={facturasDuplicadas} />
      <FusionarProveedoresPanel proveedores={proveedores} gruposSugeridos={gruposProveedores} />
      <FusionarProductosPanel gruposSugeridos={gruposProductos} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">CUIT</th>
              <th className="px-3 py-2 text-right">Facturas</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{p.nombre}</td>
                <td className="px-3 py-2 text-slate-500">{p.categoria}</td>
                <td className="px-3 py-2 text-slate-500">{p.cuit ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-700">{p.facturas}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                  {formatoMoneda(p.total)}
                </td>
              </tr>
            ))}
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Todavía no hay proveedores cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
