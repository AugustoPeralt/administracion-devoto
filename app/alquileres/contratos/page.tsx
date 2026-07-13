import Link from "next/link";
import { obtenerContratosConSemaforo } from "@/lib/alquileres/consultas";
import { COLOR_SEMAFORO_CONTRATO, ETIQUETAS_ESTADO_CONTRATO } from "@/lib/alquileres/etiquetas";
import { Badge } from "@/components/Badge";
import { formatoFecha } from "@/lib/formato";

export default async function ContratosPage() {
  const contratos = await obtenerContratosConSemaforo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Contratos de locación</h1>
        <p className="text-sm text-slate-500">
          {contratos.length} contrato(s) · vigentes ordenados por vencimiento más próximo.
        </p>
      </div>

      {contratos.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          Todavía no hay contratos sincronizados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2 text-right">Días</th>
                <th className="px-3 py-2">Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/alquileres/contratos/${c.id}`} className="font-medium text-slate-950 hover:underline">
                      {c.local}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {ETIQUETAS_ESTADO_CONTRATO[c.estado] ?? c.estado}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-600">{c.tipo ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {c.vencimiento ? formatoFecha(c.vencimiento) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {c.diasRestantes ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge color={COLOR_SEMAFORO_CONTRATO[c.semaforo]}>{c.semaforo}</Badge>
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
