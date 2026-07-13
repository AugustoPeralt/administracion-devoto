import Link from "next/link";
import { obtenerAjustesOcultos, obtenerTodasLasCajas, type EstadoAjuste } from "@/lib/queries";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { SelectorCaja } from "@/components/SelectorCaja";
import { justificarMovimiento } from "./actions";

const PESTANIAS: { valor: EstadoAjuste; etiqueta: string }[] = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "justificados", etiqueta: "Justificados" },
  { valor: "todos", etiqueta: "Todos" },
];

function esEstadoValido(valor: string | undefined): valor is EstadoAjuste {
  return PESTANIAS.some((p) => p.valor === valor);
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; caja?: string }>;
}) {
  const params = await searchParams;
  const estado: EstadoAjuste = esEstadoValido(params.estado) ? params.estado : "pendientes";
  const cajaId = params.caja ? Number(params.caja) : undefined;
  const [ajustes, todasLasCajas] = await Promise.all([
    obtenerAjustesOcultos(estado, Number.isInteger(cajaId) ? cajaId : undefined),
    obtenerTodasLasCajas(),
  ]);

  const mensajeVacio: Record<EstadoAjuste, string> = {
    pendientes: "No hay ajustes pendientes de justificar.",
    justificados: "Todavía no se justificó ningún ajuste.",
    todos: "No se encontraron ajustes.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Auditoría de ajustes ocultos</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Estos movimientos tienen una fórmula de aritmética escrita directamente en la celda de monto (ej.{" "}
          <span className="rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-700">
            =-15399000+452000
          </span>
          ), lo que oculta el origen de cada número. No se modifica el Excel: acá se deja constancia de a qué
          corresponde cada ajuste para que la dirección lo pueda auditar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PESTANIAS.map((p) => (
          <Link
            key={p.valor}
            href={`/consolidados/auditoria?estado=${p.valor}${cajaId ? `&caja=${cajaId}` : ""}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              estado === p.valor
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <SelectorCaja cajas={todasLasCajas} />
      </div>

      {ajustes.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          {mensajeVacio[estado]}
        </p>
      )}

      <div className="space-y-3">
        {ajustes.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/consolidados/cajas/${a.cajaId}`} className="font-semibold text-slate-950 hover:underline">
                  {a.cajaNombre}
                </Link>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-500">{formatoFecha(a.fecha)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-700">{a.descripcionFinal}</span>
                {a.comentarioJustificacion ? (
                  <Badge color="verde">Justificado</Badge>
                ) : (
                  <Badge color="ambar">⚠️ Requiere justificación</Badge>
                )}
              </div>
              <div
                className={`font-mono tabular-nums font-medium ${
                  a.tipoMovimiento === "ingreso" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatoMoneda(a.montoArs)}
              </div>
            </div>
            <div className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-600">
              {a.formulaOriginal}
            </div>

            {a.comentarioJustificacion ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm">
                <p className="text-slate-700">{a.comentarioJustificacion}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Justificado por {a.justificadoPor} · {a.justificadoEn ? formatoFechaHora(a.justificadoEn) : ""}
                </p>
              </div>
            ) : (
              <form action={justificarMovimiento} className="mt-3 flex flex-wrap items-start gap-2">
                <input type="hidden" name="movimientoId" value={a.id} />
                <input
                  type="text"
                  name="comentario"
                  placeholder="¿De dónde viene esta diferencia?"
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
