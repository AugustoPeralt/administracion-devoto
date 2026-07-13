import { obtenerLocalesMapping } from "@/lib/alquileres/consultas";
import { Badge } from "@/components/Badge";
import { crearMapeo, alternarActivoMapeo, eliminarMapeo } from "./actions";

export default async function MapeosPage() {
  const mapeos = await obtenerLocalesMapping();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Mapeo de proveedores</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Cada CBC identifica el alquiler por el nombre del proveedor tal como aparece cargado ahí — acá se define
          a qué local canónico corresponde. Un proveedor sin entrada activa genera una alerta &quot;Proveedor no
          mapeado&quot; en vez de perderse silenciosamente.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Nuevo mapeo</h2>
        <form action={crearMapeo} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Proveedor (tal como en el CBC)</label>
            <input
              type="text"
              name="proveedorCbc"
              required
              placeholder="Ej. Roberto Mouro (Alquiler)"
              className="min-w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Local canónico</label>
            <input
              type="text"
              name="localCanonico"
              required
              placeholder="Ej. ENCISO"
              className="w-48 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Proveedor (CBC)</th>
              <th className="px-3 py-2">Local canónico</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {mapeos.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{m.proveedorCbc}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{m.localCanonico}</td>
                <td className="px-3 py-2">
                  {m.activo ? <Badge color="verde">Activo</Badge> : <Badge>Desactivado</Badge>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <form action={alternarActivoMapeo} className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="activo" value={String(m.activo)} />
                    <button type="submit" className="mr-3 text-xs text-slate-500 hover:text-slate-900">
                      {m.activo ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                  <form action={eliminarMapeo} className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="text-xs text-rose-500 hover:text-rose-700">
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {mapeos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  Todavía no hay mapeos configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
