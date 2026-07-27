import Link from "next/link";
import { obtenerAlertasMesActual, obtenerAlertasHistoricas, type EstadoAlertaHistorica } from "@/lib/queries";
import { formatoMesAnio, formatoFechaHora } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { confirmarAlertaHistorica, justificarAlertaHistorica } from "./actions";

const PESTANIAS: { valor: EstadoAlertaHistorica; etiqueta: string }[] = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "confirmados", etiqueta: "Confirmados" },
  { valor: "justificados", etiqueta: "Justificados" },
  { valor: "todos", etiqueta: "Todos" },
];

function esEstadoValido(valor: string | undefined): valor is EstadoAlertaHistorica {
  return PESTANIAS.some((p) => p.valor === valor);
}

const MENSAJE_VACIO: Record<EstadoAlertaHistorica, string> = {
  pendientes: "No se encontraron meses anteriores sin revisar: no se escapó ningún pago pendiente.",
  confirmados: "Todavía no se confirmó ningún pago faltante de meses anteriores.",
  justificados: "Todavía no se justificó ningún hueco de meses anteriores.",
  todos: "No se encontraron huecos en meses anteriores.",
};

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ historico?: string }>;
}) {
  const params = await searchParams;
  const estadoHistorico: EstadoAlertaHistorica = esEstadoValido(params.historico) ? params.historico : "pendientes";

  const [alertas, alertasHistoricas] = await Promise.all([
    obtenerAlertasMesActual(),
    obtenerAlertasHistoricas(estadoHistorico),
  ]);

  const porCaja = new Map<string, typeof alertas>();
  for (const a of alertas) {
    const lista = porCaja.get(a.cajaNombre) ?? [];
    lista.push(a);
    porCaja.set(a.cajaNombre, lista);
  }

  const porCajaHistorico = new Map<string, typeof alertasHistoricas>();
  for (const a of alertasHistoricas) {
    const lista = porCajaHistorico.get(a.cajaNombre) ?? [];
    lista.push(a);
    porCajaHistorico.set(a.cajaNombre, lista);
  }
  const gruposHistoricos = [...porCajaHistorico.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Alertas de pagos pendientes</h1>
            <p className="max-w-3xl text-sm text-slate-500">
              Pagos recurrentes (alquileres, sueldos, sistemas, etc.) que todavía no aparecen cargados este mes en
              su caja. Puede ser que falte pagarlo o que se haya olvidado cargar — cualquiera de las dos cosas hay
              que revisarla.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/consolidados/alertas/efectivo"
              className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              Alquileres en efectivo
            </Link>
            <Link
              href="/consolidados/alertas/reglas"
              className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              Configurar reglas
            </Link>
          </div>
        </div>

        {alertas.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            No hay alertas: todos los pagos recurrentes configurados ya aparecen cargados este mes.
          </p>
        ) : (
          <div className="space-y-4">
            {[...porCaja.entries()].map(([cajaNombre, items]) => (
              <div key={cajaNombre} className="rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Link href={`/consolidados/cajas/${items[0].cajaId}`} className="font-semibold text-slate-950 hover:underline">
                    {cajaNombre}
                  </Link>
                  <Badge color="rojo">{items.length} sin cargar</Badge>
                </div>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="text-sm text-slate-700">
                      {item.nombre}{" "}
                      <span className="font-mono text-xs text-slate-400">
                        ({item.codTitular !== null ? `cód. titular ${item.codTitular}` : `cód. cuenta ${item.codCuenta}`})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Meses anteriores</h2>
          <p className="max-w-3xl text-sm text-slate-500">
            Recorre todos los meses desde el primer movimiento cargado en cada caja (menos el actual, que ya está
            arriba) para rastrear que no se haya escapado ningún pago pendiente de los restaurantes en el pasado.
            Cada hueco hay que confirmarlo (problema real, para hacer seguimiento) o justificarlo (ej. el contrato
            todavía no empezaba ese mes).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PESTANIAS.map((p) => (
            <Link
              key={p.valor}
              href={`/consolidados/alertas?historico=${p.valor}`}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                estadoHistorico === p.valor
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {p.etiqueta}
            </Link>
          ))}
        </div>

        {alertasHistoricas.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            {MENSAJE_VACIO[estadoHistorico]}
          </p>
        ) : (
          <div className="space-y-3">
            {gruposHistoricos.map(([cajaNombre, items]) => {
              const pendientes = items.filter((i) => i.estado === "pendiente").length;
              return (
                <details
                  key={cajaNombre}
                  open={pendientes > 0}
                  className={`group rounded-lg border bg-white shadow-sm ${
                    pendientes > 0 ? "border-rose-200" : "border-slate-200"
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 p-4">
                    <Link href={`/consolidados/cajas/${items[0].cajaId}`} className="font-semibold text-slate-950 hover:underline">
                      {cajaNombre}
                    </Link>
                    {pendientes > 0 ? (
                      <Badge color="rojo">{pendientes} sin revisar</Badge>
                    ) : (
                      <Badge color="verde">{items.length} revisados</Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-400 group-open:hidden">Mostrar</span>
                    <span className="ml-auto hidden text-xs text-slate-400 group-open:inline">Ocultar</span>
                  </summary>

                  <div className="space-y-3 border-t border-slate-100 p-4 pt-3">
                    {items.map((a) => (
                      <div
                        key={`${a.conceptoId}-${a.mes}`}
                        className="rounded-md border border-slate-100 bg-slate-50/40 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium capitalize text-slate-800">{formatoMesAnio(a.mes)}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-sm text-slate-700">{a.nombre}</span>
                          <span className="font-mono text-xs text-slate-400">
                            ({a.codTitular !== null ? `cód. titular ${a.codTitular}` : `cód. cuenta ${a.codCuenta}`})
                          </span>
                          {a.estado === "pendiente" && <Badge color="rojo">Sin cargar</Badge>}
                          {a.estado === "confirmado" && <Badge color="rojo">Confirmado</Badge>}
                          {a.estado === "justificado" && <Badge color="verde">Justificado</Badge>}
                        </div>

                        {a.estado !== "pendiente" ? (
                          <div
                            className={`mt-3 rounded-md border p-3 text-sm ${
                              a.estado === "confirmado" ? "border-rose-100 bg-rose-50" : "border-emerald-100 bg-emerald-50"
                            }`}
                          >
                            <p className="text-slate-700">{a.comentario}</p>
                            <p className={`mt-1 text-xs ${a.estado === "confirmado" ? "text-rose-700" : "text-emerald-700"}`}>
                              {a.estado === "confirmado" ? "Confirmado" : "Justificado"} por {a.usuarioEmail} ·{" "}
                              {a.fechaResolucion ? formatoFechaHora(a.fechaResolucion) : ""}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <form action={confirmarAlertaHistorica} className="flex flex-1 flex-wrap items-start gap-2">
                              <input type="hidden" name="conceptoId" value={a.conceptoId} />
                              <input type="hidden" name="mes" value={a.mes} />
                              <input
                                type="text"
                                name="comentario"
                                placeholder="¿Qué faltó? (para hacer seguimiento)"
                                required
                                className="min-w-64 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-950"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-rose-700"
                              >
                                Confirmar faltante
                              </button>
                            </form>
                            <form action={justificarAlertaHistorica} className="flex flex-1 flex-wrap items-start gap-2">
                              <input type="hidden" name="conceptoId" value={a.conceptoId} />
                              <input type="hidden" name="mes" value={a.mes} />
                              <input
                                type="text"
                                name="comentario"
                                placeholder="¿Por qué está bien que no aparezca?"
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
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
