import Link from "next/link";
import { obtenerPosiblesDuplicados, type EstadoDuplicado } from "@/lib/queries";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { confirmarDuplicado, justificarNoDuplicado } from "./actions";

const PESTANIAS: { valor: EstadoDuplicado; etiqueta: string }[] = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "confirmados", etiqueta: "Confirmados" },
  { valor: "justificados", etiqueta: "Justificados" },
  { valor: "todos", etiqueta: "Todos" },
];

function esEstadoValido(valor: string | undefined): valor is EstadoDuplicado {
  return PESTANIAS.some((p) => p.valor === valor);
}

const MENSAJE_VACIO: Record<EstadoDuplicado, string> = {
  pendientes: "No hay casos pendientes de revisar.",
  confirmados: "Todavía no se confirmó ningún duplicado real.",
  justificados: "Todavía no se justificó ningún caso.",
  todos: "No se encontraron posibles duplicados.",
};

export default async function DuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const params = await searchParams;
  const estado: EstadoDuplicado = esEstadoValido(params.estado) ? params.estado : "pendientes";
  const casos = await obtenerPosiblesDuplicados(estado);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Posibles duplicados</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Mismo concepto, misma caja, misma fecha, cargado más de una vez en filas separadas de la hoja —
          típicamente una re-carga que no borró la original. No se modifica el Excel ni se decide solo cuál
          monto es el correcto: cada caso hay que confirmarlo como duplicado real (para revisar en el archivo)
          o justificar por qué no lo es.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PESTANIAS.map((p) => (
          <Link
            key={p.valor}
            href={`/consolidados/duplicados?estado=${p.valor}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              estado === p.valor
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </div>

      {casos.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          {MENSAJE_VACIO[estado]}
        </p>
      )}

      <div className="space-y-3">
        {casos.map((caso) => (
          <div key={`${caso.cajaId}-${caso.fecha}-${caso.codTitular}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/consolidados/cajas/${caso.cajaId}?dia=${caso.fecha}`} className="font-semibold text-slate-950 hover:underline">
                  {caso.cajaNombre}
                </Link>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-500">{formatoFecha(caso.fecha)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-700">{caso.titular}</span>
                {caso.estado === "pendiente" && <Badge color="ambar">⚠️ Sin revisar</Badge>}
                {caso.estado === "confirmado" && <Badge color="rojo">Duplicado confirmado</Badge>}
                {caso.estado === "justificado" && <Badge color="verde">Justificado</Badge>}
                {!caso.montosIguales && <Badge>Montos distintos</Badge>}
              </div>
            </div>

            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="py-1 pr-4">Fila Excel</th>
                  <th className="py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {caso.movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="py-1 pr-4 font-mono text-xs text-slate-500">{m.filaExcel}</td>
                    <td className="py-1 text-right font-mono tabular-nums text-slate-800">
                      {formatoMoneda(m.montoArs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {caso.estado !== "pendiente" ? (
              <div
                className={`mt-3 rounded-md border p-3 text-sm ${
                  caso.estado === "confirmado" ? "border-rose-100 bg-rose-50" : "border-emerald-100 bg-emerald-50"
                }`}
              >
                <p className="text-slate-700">{caso.comentario}</p>
                <p className={`mt-1 text-xs ${caso.estado === "confirmado" ? "text-rose-700" : "text-emerald-700"}`}>
                  {caso.estado === "confirmado" ? "Confirmado" : "Justificado"} por {caso.usuarioEmail} ·{" "}
                  {caso.fechaResolucion ? formatoFechaHora(caso.fechaResolucion) : ""}
                </p>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={confirmarDuplicado} className="flex flex-1 flex-wrap items-start gap-2">
                  <input type="hidden" name="cajaId" value={caso.cajaId} />
                  <input type="hidden" name="fecha" value={caso.fecha} />
                  <input type="hidden" name="codTitular" value={caso.codTitular} />
                  <input
                    type="text"
                    name="comentario"
                    placeholder="¿Qué se ve mal? (ej. cuál monto parece el correcto)"
                    required
                    className="min-w-64 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-950"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-rose-700"
                  >
                    Confirmar duplicado
                  </button>
                </form>
                <form action={justificarNoDuplicado} className="flex flex-1 flex-wrap items-start gap-2">
                  <input type="hidden" name="cajaId" value={caso.cajaId} />
                  <input type="hidden" name="fecha" value={caso.fecha} />
                  <input type="hidden" name="codTitular" value={caso.codTitular} />
                  <input
                    type="text"
                    name="comentario"
                    placeholder="¿Por qué NO es un duplicado?"
                    required
                    className="min-w-64 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-950"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800"
                  >
                    Justificar
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
