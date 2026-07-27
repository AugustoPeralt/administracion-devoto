import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import type { UltimaCargaLocal } from "@/lib/control-precios/consultas";

// A partir de esta cantidad de días sin factura nueva, se resalta como
// desactualizado — una quincena y medio de margen antes de llamar la atención.
const UMBRAL_DIAS_ALERTA = 20;

function diasDesde(fechaISO: string): number {
  const hoy = new Date();
  const fecha = new Date(`${fechaISO}T00:00:00`);
  return Math.floor((hoy.getTime() - fecha.getTime()) / 86_400_000);
}

export function UltimaCargaPorLocalPanel({
  porLocal,
  sinAsignar,
}: {
  porLocal: UltimaCargaLocal[];
  sinAsignar: { total: number; ultimaFechaEmision: string | null };
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Última carga por restaurante</h2>
      <p className="mb-3 text-xs text-slate-500">
        Para saber desde qué fecha retomar en cada local. Ordenado con los más atrasados primero.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-1.5 pr-2">Restaurante</th>
              <th className="py-1.5 text-right">Última factura</th>
              <th className="py-1.5 text-right">Cargada el</th>
              <th className="py-1.5 text-right">Total facturas</th>
            </tr>
          </thead>
          <tbody>
            {porLocal.map((l) => {
              const sinDatos = l.ultimaFechaEmision === null;
              const dias = l.ultimaFechaEmision !== null ? diasDesde(l.ultimaFechaEmision) : null;
              const desactualizado = sinDatos || (dias !== null && dias >= UMBRAL_DIAS_ALERTA);
              return (
                <tr key={l.id} className={`border-b border-slate-50 ${desactualizado ? "bg-amber-50" : ""}`}>
                  <td className="py-1.5 pr-2 font-medium text-slate-900">{l.localNombre}</td>
                  <td className="py-1.5 text-right">
                    {sinDatos ? (
                      <span className="text-xs font-medium text-amber-700">nunca se cargó nada</span>
                    ) : (
                      <span className={desactualizado ? "font-medium text-amber-700" : "text-slate-700"}>
                        {formatoFecha(l.ultimaFechaEmision!)}{" "}
                        <span className="text-xs text-slate-400">(hace {dias} día{dias === 1 ? "" : "s"})</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-xs text-slate-500">
                    {l.ultimaFechaCarga ? formatoFechaHora(l.ultimaFechaCarga) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-slate-700">{l.totalFacturas}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sinAsignar.total > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Además hay <span className="font-medium text-slate-700">{sinAsignar.total}</span> factura
          {sinAsignar.total === 1 ? "" : "s"} sin restaurante asignado
          {sinAsignar.ultimaFechaEmision && <> (la más reciente del {formatoFecha(sinAsignar.ultimaFechaEmision)})</>}.
        </p>
      )}
    </div>
  );
}
