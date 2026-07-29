import { EmparejarPreciosPanel } from "@/components/EmparejarPreciosPanel";
import { ImportarListaPrecioForm } from "@/components/ImportarListaPrecioForm";
import { SugerenciasPendientesPanel } from "@/components/SugerenciasPendientesPanel";
import { obtenerListasParaEmparejar, obtenerSugerenciasPendientes } from "@/lib/control-precios/consultas";
import Link from "next/link";
import { importarListaElCriollo, importarListaElEmporio } from "./actions";

export default async function ComparacionProveedoresPage() {
  const [{ criollo, emporio }, sugerencias] = await Promise.all([
    obtenerListasParaEmparejar(),
    obtenerSugerenciasPendientes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Comparación de proveedores</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Subí la lista de precios de El Criollo y de El Emporio, y emparejá a mano qué producto de una es el mismo
            que cuál de la otra.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/control-precios/comparacion/resultados"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Comparación de precios (Criollo ↔ Emporio) →
          </Link>
          <Link
            href="/control-precios/comparacion/sustitutos"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Buscar sustitutos más baratos →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ImportarListaPrecioForm
          titulo="Lista de precios — El Criollo (.xls)"
          extensionesAceptadas=".xls,.xlsx"
          accion={importarListaElCriollo}
        />
        <ImportarListaPrecioForm
          titulo="Lista de precios — El Emporio (.xlsx)"
          extensionesAceptadas=".xls,.xlsx"
          accion={importarListaElEmporio}
        />
      </div>

      {sugerencias.length > 0 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-slate-950">
            Sugerencias pendientes ({sugerencias.length})
          </h2>
          <p className="mb-2 max-w-3xl text-sm text-slate-500">
            Candidatos con similitud parcial que no se confirmaron solos — el motivo de la duda está en la columna de
            la derecha. Marcá "Es el mismo" si confirmás que es el mismo producto real, o "No es" para descartarlo.
          </p>
          <SugerenciasPendientesPanel filas={sugerencias} />
        </div>
      )}

      {(criollo.length > 0 || emporio.length > 0) && (
        <div>
          <h2 className="mb-2 text-lg font-semibold tracking-tight text-slate-950">Emparejar productos</h2>
          <EmparejarPreciosPanel criollo={criollo} emporio={emporio} />
        </div>
      )}
    </div>
  );
}
