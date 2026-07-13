import Link from "next/link";
import { obtenerResumenAlquileres, obtenerAlertasVigentes, obtenerUltimaSyncAlquileres } from "@/lib/alquileres/consultas";
import { ETIQUETAS_TIPO_ALERTA, COLOR_PRIORIDAD, ETIQUETAS_PRIORIDAD } from "@/lib/alquileres/etiquetas";
import { formatoMoneda, formatoFecha, formatoFechaHora } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { KpiTile } from "@/components/KpiTile";
import { BotonActualizar } from "@/components/BotonActualizar";
import { sincronizarAlquileres } from "./actions";

export default async function AlquileresDashboardPage() {
  const [resumen, alertasTop, ultimaSync] = await Promise.all([
    obtenerResumenAlquileres(),
    obtenerAlertasVigentes(),
    obtenerUltimaSyncAlquileres(),
  ]);

  const alertasCriticasYUrgentes = alertasTop
    .filter((a) => a.prioridad === "critica" || a.prioridad === "urgente")
    .slice(0, 15);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Alquileres</h1>
          <p className="text-sm text-slate-500">Monitoreo de contratos de locación y pagos por local.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400">
            {ultimaSync
              ? `Última sincronización: ${formatoFechaHora(ultimaSync.iniciadoEn)}`
              : "Todavía no se sincronizó."}
          </p>
          <form action={sincronizarAlquileres}>
            <BotonActualizar />
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile label="Locales con contrato vigente" valor={String(resumen.localesConContratoVigente)} />
        <KpiTile label="Locales con datos de CBC" valor={String(resumen.localesConDatosCbc)} />
        <KpiTile label="Canon mes actual" valor={formatoMoneda(resumen.canonMesActual)} />
        <KpiTile
          label="Saldo pendiente"
          valor={formatoMoneda(resumen.saldoPendiente)}
          color={resumen.saldoPendiente > 0 ? "malo" : "bueno"}
        />
        <KpiTile
          label="Alertas críticas"
          valor={String(resumen.alertasCriticas)}
          color={resumen.alertasCriticas > 0 ? "malo" : "bueno"}
        />
        <KpiTile
          label="Alertas urgentes"
          valor={String(resumen.alertasUrgentes)}
          color={resumen.alertasUrgentes > 0 ? "atencion" : "bueno"}
        />
        <KpiTile
          label="Próximo vencimiento"
          valor={resumen.proximoVencimientoDias !== null ? `${resumen.proximoVencimientoDias} días` : "—"}
          color={
            resumen.proximoVencimientoDias !== null && resumen.proximoVencimientoDias < 90 ? "atencion" : "neutro"
          }
        />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight text-slate-950">Alertas críticas y urgentes</h2>
          <Link href="/alquileres/alertas" className="text-sm text-slate-500 hover:text-slate-900">
            Ver todas →
          </Link>
        </div>

        {alertasCriticasYUrgentes.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            Sin alertas críticas ni urgentes al día de hoy.
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
                </tr>
              </thead>
              <tbody>
                {alertasCriticasYUrgentes.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge color={COLOR_PRIORIDAD[a.prioridad]}>{ETIQUETAS_PRIORIDAD[a.prioridad] ?? a.prioridad}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{a.local}</td>
                    <td className="px-3 py-2 text-slate-700">{ETIQUETAS_TIPO_ALERTA[a.tipoAlerta] ?? a.tipoAlerta}</td>
                    <td className="px-3 py-2 text-slate-600">{a.descripcion}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {a.fechaEvento ? formatoFecha(a.fechaEvento) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                      {a.diasRestantes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
