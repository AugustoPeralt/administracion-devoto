import { CargaComprobanteForm } from "@/components/CargaComprobanteForm";
import { UltimaCargaPorLocalPanel } from "@/components/UltimaCargaPorLocalPanel";
import { obtenerLocales, obtenerUltimaCargaPorLocal } from "@/lib/control-precios/consultas";

export default async function CargaComprobantePage() {
  const [locales, ultimaCarga] = await Promise.all([obtenerLocales(), obtenerUltimaCargaPorLocal()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Cargar comprobante</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Subí la foto o el PDF de una factura o remito de proveedor. La IA extrae los datos automáticamente —
          vas a poder corregir cualquier campo antes de confirmar la carga a la base.
        </p>
      </div>
      <UltimaCargaPorLocalPanel porLocal={ultimaCarga.porLocal} sinAsignar={ultimaCarga.sinAsignar} />
      <CargaComprobanteForm locales={locales} />
    </div>
  );
}
