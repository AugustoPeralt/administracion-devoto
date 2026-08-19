import { CotejoAfipForm } from "@/components/CotejoAfipForm";
import { obtenerLocales } from "@/lib/control-precios/consultas";

export default async function CotejoAfipPage() {
  const locales = await obtenerLocales();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Cotejo contra AFIP</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Subí el excel de <strong>&quot;Mis Comprobantes Recibidos&quot;</strong> de ARCA (Libro de IVA Digital) de
          un restaurante para un período — se compara contra las facturas cargadas y muestra, por proveedor, qué
          coincide y qué falta.
        </p>
      </div>
      <CotejoAfipForm locales={locales} />
    </div>
  );
}
