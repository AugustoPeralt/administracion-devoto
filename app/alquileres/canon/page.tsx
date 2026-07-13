import { obtenerCanonVigente, obtenerNombresLocales } from "@/lib/alquileres/consultas";
import { COLOR_ESTADO_PAGO } from "@/lib/alquileres/etiquetas";
import { Badge } from "@/components/Badge";
import { formatoMoneda, formatoFecha } from "@/lib/formato";
import { guardarCanonVigente, eliminarCanonVigente } from "./actions";

export default async function CanonVigentePage() {
  const [config, locales] = await Promise.all([obtenerCanonVigente(), obtenerNombresLocales()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Canon vigente</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Configuración por local que activa las alertas de pago pendiente/vencido y ajuste de canon próximo.
          Sin una entrada acá, esas alertas nunca se disparan para ese local.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Nueva entrada / editar</h2>
        <form action={guardarCanonVigente} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Local</label>
            <input
              list="locales"
              name="local"
              required
              placeholder="Ej. ENCISO"
              className="w-48 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
            <datalist id="locales">
              {locales.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Día pago desde</label>
            <input
              type="number"
              name="diaPagoDesde"
              min={1}
              max={31}
              defaultValue={1}
              required
              className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Día pago hasta</label>
            <input
              type="number"
              name="diaPagoHasta"
              min={1}
              max={31}
              defaultValue={10}
              required
              className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Próximo ajuste</label>
            <input
              type="date"
              name="proximoAjuste"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Índice de ajuste</label>
            <input
              type="text"
              name="indiceAjuste"
              placeholder="Ej. ICC"
              className="w-28 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Preaviso prórroga (días)</label>
            <input
              type="number"
              name="preavisoProrrogaDias"
              min={0}
              defaultValue={30}
              required
              className="w-32 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800"
          >
            Guardar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Local</th>
              <th className="px-3 py-2">Mes ref.</th>
              <th className="px-3 py-2 text-right">Canon vigente</th>
              <th className="px-3 py-2">Estado pago</th>
              <th className="px-3 py-2">Ventana de pago</th>
              <th className="px-3 py-2">Próximo ajuste</th>
              <th className="px-3 py-2">Preaviso prórroga</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {config.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{c.local}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.ultimoMes ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                  {c.canonVigente !== null ? formatoMoneda(c.canonVigente) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {c.estadoPago ? <Badge color={COLOR_ESTADO_PAGO[c.estadoPago]}>{c.estadoPago}</Badge> : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  Del {c.diaPagoDesde} al {c.diaPagoHasta}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {c.proximoAjuste ? `${formatoFecha(c.proximoAjuste)} (${c.indiceAjuste ?? "?"})` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.preavisoProrrogaDias} días</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <form action={eliminarCanonVigente} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-rose-500 hover:text-rose-700">
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {config.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Todavía no hay ningún local configurado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
