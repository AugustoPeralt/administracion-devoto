import { ImportarPrecios5cynarForm } from "@/components/ImportarPrecios5cynarForm";

export default function ImportarPreciosVerduleriaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Precios de referencia — Verdulería</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Subí acá el Excel de contabilidad de 5cynar (facturaBpedidosJulio-diciembre 2026.xlsx u otro que lo
          reemplace) cada vez que se actualice. Los remitos de VERDULERIA que llegan sin precio impreso se
          completan automáticamente contra esta lista al confirmarlos.
        </p>
      </div>
      <ImportarPrecios5cynarForm />
    </div>
  );
}
