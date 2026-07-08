import Link from "next/link";
import { RANGOS, type RangoTiempo, obtenerResumenCajas, obtenerUltimaSincronizacion } from "@/lib/queries";
import { formatoMoneda, formatoFechaHora } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { BotonActualizar } from "@/components/BotonActualizar";
import { actualizarDesdeSharePoint } from "./actions";

function esRangoValido(valor: string | undefined): valor is RangoTiempo {
  return RANGOS.some((r) => r.valor === valor);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const params = await searchParams;
  const rango: RangoTiempo = esRangoValido(params.rango) ? params.rango : "mes";
  const [resumen, ultimaSync] = await Promise.all([obtenerResumenCajas(rango), obtenerUltimaSincronizacion()]);

  const operativas = resumen.filter((r) => r.tipo === "operativa");
  const obras = resumen.filter((r) => r.tipo === "obra");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Dashboard</h1>
          <p className="text-sm text-slate-500">Flujo de caja consolidado por período.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400">
            {ultimaSync ? `Última actualización: ${formatoFechaHora(ultimaSync)}` : "Todavía no se sincronizó."}
          </p>
          <form action={actualizarDesdeSharePoint}>
            <BotonActualizar />
          </form>
        </div>
      </div>

      <div className="flex gap-2">
        {RANGOS.map((r) => (
          <Link
            key={r.valor}
            href={`/?rango=${r.valor}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              rango === r.valor
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {r.etiqueta}
          </Link>
        ))}
      </div>

      <SeccionCajas titulo="Cajas operativas" cajas={operativas} />
      <SeccionCajas titulo="Cajas de obra" cajas={obras} />
    </div>
  );
}

function SeccionCajas({
  titulo,
  cajas,
}: {
  titulo: string;
  cajas: Awaited<ReturnType<typeof obtenerResumenCajas>>;
}) {
  if (cajas.length === 0) return null;

  const totalNeto = cajas.reduce((acc, c) => acc + c.neto, 0);
  const totalNetoUsd = cajas.reduce((acc, c) => acc + c.netoUsd, 0);
  const totalPendientes = cajas.reduce((acc, c) => acc + c.pendientesJustificacion, 0);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">{titulo}</h2>
        <div className="text-sm text-slate-500">
          Neto del período:{" "}
          <span
            className={`font-mono tabular-nums font-medium ${totalNeto >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {formatoMoneda(totalNeto)}
          </span>
          {totalNetoUsd !== 0 && (
            <span
              className={`ml-2 font-mono tabular-nums font-medium ${totalNetoUsd >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              ({formatoMoneda(totalNetoUsd, "USD")})
            </span>
          )}
          {totalPendientes > 0 && (
            <span className="ml-3">
              <Badge color="ambar">{totalPendientes} sin justificar</Badge>
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cajas.map((caja) => {
          const tieneActividadUsd =
            caja.ingresosUsd !== 0 || caja.egresosUsd !== 0 || caja.saldoActualUsd !== 0;
          return (
          <Link
            key={caja.id}
            href={`/cajas/${caja.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-950">{caja.nombre}</h3>
              <div className="flex gap-1">
                {caja.pendientesJustificacion > 0 && (
                  <Badge color="ambar">{caja.pendientesJustificacion} pend.</Badge>
                )}
                {caja.justificados > 0 && <Badge color="verde">{caja.justificados} justif.</Badge>}
              </div>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Ingresos</dt>
                <dd className="font-mono tabular-nums text-emerald-600">{formatoMoneda(caja.ingresos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Egresos</dt>
                <dd className="font-mono tabular-nums text-rose-600">{formatoMoneda(caja.egresos)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 font-medium">
                <dt className="text-slate-700">Neto período</dt>
                <dd
                  className={`font-mono tabular-nums ${caja.neto >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {formatoMoneda(caja.neto)}
                </dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Saldo actual</dt>
                <dd className="font-mono tabular-nums">{formatoMoneda(caja.saldoActualArs)}</dd>
              </div>
              <div className="flex justify-between text-slate-400">
                <dt>Movimientos</dt>
                <dd className="font-mono tabular-nums">{caja.cantidadMovimientos}</dd>
              </div>
            </dl>

            {tieneActividadUsd && (
              <dl className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Ingresos USD</dt>
                  <dd className="font-mono tabular-nums text-emerald-600">
                    {formatoMoneda(caja.ingresosUsd, "USD")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Egresos USD</dt>
                  <dd className="font-mono tabular-nums text-rose-600">{formatoMoneda(caja.egresosUsd, "USD")}</dd>
                </div>
                <div className="flex justify-between text-slate-500">
                  <dt>Saldo actual USD</dt>
                  <dd className="font-mono tabular-nums">{formatoMoneda(caja.saldoActualUsd, "USD")}</dd>
                </div>
              </dl>
            )}
          </Link>
          );
        })}
      </div>
    </section>
  );
}
