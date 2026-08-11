import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerFacturaConDetalle } from "@/lib/control-precios/consultas";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { EditorFacturaConfirmada } from "@/components/EditorFacturaConfirmada";
import { Badge } from "@/components/Badge";

export default async function FacturaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facturaId = Number(id);
  if (!Number.isInteger(facturaId)) notFound();

  const factura = await obtenerFacturaConDetalle(facturaId);
  if (!factura) notFound();

  return (
    <div className="space-y-6">
      <Link href="/control-precios/proveedores" className="text-sm text-slate-500 hover:text-slate-900">
        ← Volver a Calidad de datos
      </Link>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{factura.proveedorNombre}</h1>
            <p className="text-sm text-slate-500">
              {formatoFecha(factura.fechaEmision)} · {factura.localNombre ?? "sin local"}
              {factura.numeroFactura ? ` · N° ${factura.numeroFactura}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={factura.estado === "confirmada" ? "verde" : "ambar"}>
              {factura.estado === "confirmada" ? "Confirmada" : "Pendiente de revisión"}
            </Badge>
            {factura.archivoUrl && (
              <a
                href={`/api/control-precios/ver-comprobante/${factura.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver foto del comprobante ↗
              </a>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Monto total impreso: <span className="font-mono tabular-nums text-slate-900">{formatoMoneda(factura.montoTotal)}</span>
        </p>
      </div>

      <EditorFacturaConfirmada factura={factura} />
    </div>
  );
}
