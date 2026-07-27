import { EmparejarPreciosPanel } from "@/components/EmparejarPreciosPanel";
import { ImportarListaPrecioForm } from "@/components/ImportarListaPrecioForm";
import { SugerenciasPendientesPanel } from "@/components/SugerenciasPendientesPanel";
import { TablaComparacionProveedores } from "@/components/TablaComparacionProveedores";
import { DESCUENTO_LISTA_EL_CRIOLLO } from "@/lib/control-precios/constantes";
import {
  obtenerComparacionCriolloEmporio,
  obtenerListasParaEmparejar,
  obtenerSugerenciasPendientes,
} from "@/lib/control-precios/consultas";
import { importarListaElCriollo, importarListaElEmporio } from "./actions";

export default async function ComparacionProveedoresPage() {
  const [{ criollo, emporio }, comparacion, sugerencias] = await Promise.all([
    obtenerListasParaEmparejar(),
    obtenerComparacionCriolloEmporio(),
    obtenerSugerenciasPendientes(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Comparación de proveedores</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Subí la lista de precios de El Criollo y de El Emporio, emparejá a mano qué producto de una es el mismo que
          cuál de la otra, y compará precios — priorizando siempre el último precio real pagado por sobre el de
          lista, cuando exista.
        </p>
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

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Precio de El Criollo <strong>real ajustado</strong> (ya lo compraron): el precio_unitario de la factura solo
        trae el 10% de descuento de lista — se le resta un 6% más para completar el {DESCUENTO_LISTA_EL_CRIOLLO}%
        combinado que realmente paga El Criollo (el 6% adicional lo aplican sobre el total con IVA de la factura, no
        por ítem, pero el precio mostrado ya lo tiene en cuenta). Precio <strong>estimado</strong> (sin compra real
        todavía): se le resta directo el {DESCUENTO_LISTA_EL_CRIOLLO}% al precio de lista.
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

      <div>
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-slate-950">Comparación de precios</h2>
        <TablaComparacionProveedores filas={comparacion} />
      </div>
    </div>
  );
}
