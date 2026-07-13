import Link from "next/link";
import { obtenerAlquileresEfectivo } from "@/lib/alquileres-efectivo";
import { obtenerTodasLasCajas } from "@/lib/queries";
import { formatoMoneda, formatoFecha } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { crearAlquilerEfectivo, alternarActivoAlquilerEfectivo, eliminarAlquilerEfectivo } from "./actions";

export default async function AlquileresEfectivoPage() {
  const [{ alquileres, sinClasificar }, cajas] = await Promise.all([
    obtenerAlquileresEfectivo(),
    obtenerTodasLasCajas(),
  ]);

  const porCaja = new Map<string, typeof alquileres>();
  for (const a of alquileres) {
    (porCaja.get(a.cajaNombre) ?? porCaja.set(a.cajaNombre, []).get(a.cajaNombre)!).push(a);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/consolidados/alertas" className="text-sm text-slate-500 hover:text-slate-900">
          ← Volver a Alertas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Alquileres en efectivo</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Todos comparten el mismo código de titular (3, &quot;ALQUILER LOCAL&quot; genérico) — se distinguen acá por
          palabras clave en la descripción del movimiento. La &quot;próxima actualización estimada&quot; se calcula
          del historial real: cada vez que el monto pagado cambia más de 1% se cuenta como un ajuste, y se promedia
          el tiempo entre ajustes.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Nuevo alquiler en efectivo</h2>
        <form action={crearAlquilerEfectivo} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Caja</label>
            <select
              name="cajaId"
              required
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            >
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Nombre</label>
            <input
              type="text"
              name="nombre"
              required
              placeholder="Ej. FERRETERIA"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Palabras clave (separadas por coma)</label>
            <input
              type="text"
              name="palabrasClave"
              placeholder="Ej. FERRETERIA — vacío = agrupa todo lo no clasificado de esa caja"
              className="min-w-80 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Código titular</label>
            <input
              type="number"
              name="codTitular"
              defaultValue={3}
              className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
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

      {porCaja.size === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          Todavía no hay alquileres en efectivo configurados.
        </p>
      )}

      {[...porCaja.entries()].map(([cajaNombre, items]) => (
        <section key={cajaNombre}>
          <h2 className="mb-3 text-base font-semibold tracking-tight text-slate-950">{cajaNombre}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => {
              const vencido =
                a.diasDesdeUltimoAjuste !== null &&
                a.promedioIntervaloDiasAjuste !== null &&
                a.diasDesdeUltimoAjuste > a.promedioIntervaloDiasAjuste;

              return (
                <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-950">{a.nombre}</h3>
                    {a.pagadoEsteMes ? (
                      <Badge color="verde">Pagado este mes</Badge>
                    ) : (
                      <Badge color="rojo">Pendiente este mes</Badge>
                    )}
                  </div>

                  <p className="mb-2 text-xs text-slate-400">
                    {a.palabrasClave.length > 0 ? `Palabras clave: ${a.palabrasClave.join(", ")}` : "Catch-all (resto sin clasificar de la caja)"}
                  </p>

                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Último pago</dt>
                      <dd className="text-right text-slate-800">
                        {a.ultimoPago ? (
                          <>
                            {formatoFecha(a.ultimoPago.fecha)}{" "}
                            <span className="font-mono tabular-nums">{formatoMoneda(a.ultimoPago.monto)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Ajustes detectados</dt>
                      <dd className="text-slate-800">{a.fechasAjuste.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Cada cuánto ajusta</dt>
                      <dd className="text-slate-800">
                        {a.promedioIntervaloDiasAjuste !== null ? `~${a.promedioIntervaloDiasAjuste} días` : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Próxima actualización est.</dt>
                      <dd className="text-slate-800">
                        {a.proximaActualizacionEstimada ? (
                          <span className={vencido ? "font-medium text-amber-600" : ""}>
                            {formatoFecha(a.proximaActualizacionEstimada)}
                            {vencido && " ⚠️"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex justify-end gap-3 border-t border-slate-100 pt-2">
                    <form action={alternarActivoAlquilerEfectivo}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="activo" value={String(a.activo)} />
                      <button type="submit" className="text-xs text-slate-500 hover:text-slate-900">
                        Desactivar
                      </button>
                    </form>
                    <form action={eliminarAlquilerEfectivo}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-rose-500 hover:text-rose-700">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {sinClasificar.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold tracking-tight text-slate-950">
            Sin clasificar
            <span className="ml-2 text-sm font-normal text-slate-400">
              (movimientos cod. 3 que no matchean ninguna regla activa — puede faltar una palabra clave)
            </span>
          </h2>
          <div className="space-y-4">
            {sinClasificar.map((c) => (
              <div key={c.cajaNombre} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">{c.cajaNombre}</h3>
                <ul className="space-y-1 text-sm text-slate-700">
                  {c.pagos.map((p, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {formatoFecha(p.fecha)} — {p.descripcion}
                      </span>
                      <span className="whitespace-nowrap font-mono tabular-nums text-slate-500">
                        {formatoMoneda(p.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
