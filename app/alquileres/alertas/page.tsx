import { obtenerAlertasVigentes, obtenerLocalesConAlertas } from "@/lib/alquileres/consultas";
import { ETIQUETAS_TIPO_ALERTA, ETIQUETAS_PRIORIDAD, COLOR_PRIORIDAD } from "@/lib/alquileres/etiquetas";
import { Badge } from "@/components/Badge";
import { formatoFecha } from "@/lib/formato";

const PRIORIDADES = ["critica", "urgente", "proxima", "informativa"] as const;

export default async function AlertasAlquileresPage({
  searchParams,
}: {
  searchParams: Promise<{ prioridad?: string; local?: string; tipo?: string }>;
}) {
  const params = await searchParams;
  const [alertas, locales] = await Promise.all([
    obtenerAlertasVigentes({
      prioridad: params.prioridad || undefined,
      local: params.local || undefined,
      tipoAlerta: params.tipo || undefined,
    }),
    obtenerLocalesConAlertas(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Alertas</h1>
        <p className="text-sm text-slate-500">{alertas.length} alerta(s) de la última sincronización.</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Prioridad</label>
          <select
            name="prioridad"
            defaultValue={params.prioridad ?? ""}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          >
            <option value="">Todas</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {ETIQUETAS_PRIORIDAD[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Local</label>
          <select
            name="local"
            defaultValue={params.local ?? ""}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          >
            <option value="">Todos</option>
            {locales.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Tipo</label>
          <select
            name="tipo"
            defaultValue={params.tipo ?? ""}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          >
            <option value="">Todos</option>
            {Object.entries(ETIQUETAS_TIPO_ALERTA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          Filtrar
        </button>
        {(params.prioridad || params.local || params.tipo) && (
          <a href="/alquileres/alertas" className="text-sm text-slate-400 hover:text-slate-700">
            Limpiar filtros
          </a>
        )}
      </form>

      {alertas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          Sin alertas para este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Prioridad</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-right">Días</th>
                <th className="px-3 py-2">Acción requerida</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge color={COLOR_PRIORIDAD[a.prioridad]}>{ETIQUETAS_PRIORIDAD[a.prioridad] ?? a.prioridad}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{a.local}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {ETIQUETAS_TIPO_ALERTA[a.tipoAlerta] ?? a.tipoAlerta}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{a.descripcion}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {a.fechaEvento ? formatoFecha(a.fechaEvento) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {a.diasRestantes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{a.accionRequerida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
