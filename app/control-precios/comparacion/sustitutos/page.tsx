import { TablaRecomendacionesSustitutos, type FilaRecomendacionSustituto } from "@/components/TablaRecomendacionesSustitutos";
import { NOMBRE_PROVEEDOR_EL_CRIOLLO, UMBRAL_RECOMENDACION_SUSTITUTO } from "@/lib/control-precios/constantes";
import {
  buscarProveedorIdPorNombre,
  NOMBRE_PROVEEDOR_EL_EMPORIO,
  obtenerDeltaListaMismoProveedor,
  obtenerSustitutosParaListaIds,
} from "@/lib/control-precios/consultas";

export default async function SustitutosPage() {
  const [criolloId, emporioId] = await Promise.all([
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO),
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const [deltaCriollo, deltaEmporio] = await Promise.all([
    obtenerDeltaListaMismoProveedor(criolloId, NOMBRE_PROVEEDOR_EL_CRIOLLO),
    obtenerDeltaListaMismoProveedor(emporioId, NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const relevantes = [
    ...deltaCriollo.map((d) => ({ ...d, proveedorNombre: NOMBRE_PROVEEDOR_EL_CRIOLLO })),
    ...deltaEmporio.map((d) => ({ ...d, proveedorNombre: NOMBRE_PROVEEDOR_EL_EMPORIO })),
  ].filter((d) => d.porcentajeVariacion >= UMBRAL_RECOMENDACION_SUSTITUTO);

  const idsVigentes = relevantes.map((d) => d.listaVigenteId).filter((id): id is number => id !== null);
  const sustitutosPorListaId = await obtenerSustitutosParaListaIds(idsVigentes);

  const filas: FilaRecomendacionSustituto[] = relevantes
    .map((d) => ({
      codigoProveedor: `${d.proveedorNombre}-${d.codigoProveedor}`,
      descripcion: d.descripcion,
      proveedorNombre: d.proveedorNombre,
      porcentajeVariacion: d.porcentajeVariacion,
      precioNuevo: d.precioNuevo,
      sustitutos: d.listaVigenteId !== null ? (sustitutosPorListaId.get(d.listaVigenteId) ?? []) : [],
    }))
    .sort((a, b) => b.porcentajeVariacion - a.porcentajeVariacion);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Sustitutos más baratos</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Productos de El Criollo o El Emporio que aumentaron de precio (+{UMBRAL_RECOMENDACION_SUSTITUTO}% o más)
          entre la última importación de lista y la anterior, con la alternativa más barata del mismo proveedor (misma
          variante, distinta marca) si el sistema encontró una — automático, no hace falta buscar nada.
        </p>
      </div>

      <TablaRecomendacionesSustitutos filas={filas} />
    </div>
  );
}
