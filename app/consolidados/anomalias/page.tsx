import Link from "next/link";
import { obtenerAnomalias } from "@/lib/queries";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { ETIQUETAS_ANOMALIA } from "@/lib/anomalias";

export default async function AnomaliasPage() {
  const anomalias = await obtenerAnomalias();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Anomalías de carga</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Filas donde el propio Excel ya marcaba un problema (código sin coincidencia en el catálogo de
          Titulares, o datos incompletos). Es exactamente lo que muestra el archivo original — revisar ahí.
        </p>
      </div>

      {anomalias.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          No hay anomalías registradas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Caja</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Fila Excel</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Anomalía</th>
              </tr>
            </thead>
            <tbody>
              {anomalias.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link href={`/consolidados/cajas/${a.cajaId}`} className="font-medium text-slate-950 hover:underline">
                      {a.cajaNombre}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatoFecha(a.fecha)}</td>
                  <td className="px-3 py-2 text-slate-500">{a.filaExcel}</td>
                  <td className="px-3 py-2 text-slate-800">{a.descripcionFinal}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {formatoMoneda(a.montoArs)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge color="rojo">{ETIQUETAS_ANOMALIA[a.anomalia] ?? a.anomalia}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
