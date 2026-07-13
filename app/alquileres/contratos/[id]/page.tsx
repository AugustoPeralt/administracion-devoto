import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerContratoPorId } from "@/lib/alquileres/consultas";
import { COLOR_SEMAFORO_CONTRATO, ETIQUETAS_ESTADO_CONTRATO } from "@/lib/alquileres/etiquetas";
import { Badge } from "@/components/Badge";
import { formatoFecha } from "@/lib/formato";

export default async function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contratoId = Number(id);
  if (!Number.isInteger(contratoId)) notFound();

  const contrato = await obtenerContratoPorId(contratoId);
  if (!contrato) notFound();

  const campos: { label: string; valor: string }[] = [
    { label: "Domicilio", valor: contrato.domicilio ?? "—" },
    { label: "Partes", valor: contrato.partes ?? "—" },
    { label: "Plazo", valor: contrato.plazo ?? "—" },
    { label: "Valor / moneda", valor: contrato.valorMoneda ?? "—" },
    { label: "Actualización", valor: contrato.actualizacion ?? "—" },
    { label: "Prórroga", valor: contrato.prorroga ?? "—" },
    { label: "Voluntad", valor: contrato.voluntad ?? "—" },
    { label: "Renegociación", valor: contrato.renegociacion ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/alquileres/contratos" className="text-sm text-slate-500 hover:text-slate-900">
        ← Volver a Contratos
      </Link>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{contrato.local}</h1>
            <p className="text-sm text-slate-500">{contrato.tipo ?? "Contrato de locación"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{ETIQUETAS_ESTADO_CONTRATO[contrato.estado] ?? contrato.estado}</Badge>
            <Badge color={COLOR_SEMAFORO_CONTRATO[contrato.semaforo]}>{contrato.semaforo}</Badge>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Vencimiento</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {contrato.vencimiento ? formatoFecha(contrato.vencimiento) : "—"}
              {contrato.diasRestantes !== null && (
                <span className="ml-2 text-xs text-slate-400">({contrato.diasRestantes} días)</span>
              )}
            </dd>
          </div>
          {campos.map((c) => (
            <div key={c.label}>
              <dt className="text-xs text-slate-500">{c.label}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{c.valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
