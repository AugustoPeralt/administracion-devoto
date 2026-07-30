import { SeccionColapsable } from "@/components/SeccionColapsable";
import { TablaComparacionProveedores } from "@/components/TablaComparacionProveedores";
import { TablaDeltaListaMismoProveedor } from "@/components/TablaDeltaListaMismoProveedor";
import {
  DESCUENTO_LISTA_EL_CRIOLLO,
  NOMBRE_PROVEEDOR_EL_CRIOLLO,
  UMBRAL_ALERTA_PRECIO,
  UMBRAL_RECOMENDACION_SUSTITUTO,
} from "@/lib/control-precios/constantes";
import {
  buscarProveedorIdPorNombre,
  NOMBRE_PROVEEDOR_EL_EMPORIO,
  obtenerComparacionCriolloEmporio,
  obtenerDeltaListaMismoProveedor,
  obtenerSustitutosParaListaIds,
} from "@/lib/control-precios/consultas";
import Link from "next/link";

export default async function ResultadosComparacionPage() {
  const [criolloId, emporioId] = await Promise.all([
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO),
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const [comparacion, deltaCriollo, deltaEmporio] = await Promise.all([
    obtenerComparacionCriolloEmporio(),
    obtenerDeltaListaMismoProveedor(criolloId, NOMBRE_PROVEEDOR_EL_CRIOLLO),
    obtenerDeltaListaMismoProveedor(emporioId, NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const idsConAumentoRelevante = [...deltaCriollo, ...deltaEmporio]
    .filter((d) => d.porcentajeVariacion >= UMBRAL_RECOMENDACION_SUSTITUTO)
    .map((d) => d.listaVigenteId)
    .filter((id): id is number => id !== null);
  const sustitutosPorListaId = await obtenerSustitutosParaListaIds(idsConAumentoRelevante);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Comparación de precios</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Priorizando siempre el último precio real pagado por sobre el de lista, cuando exista. Para importar una
            lista nueva o emparejar productos, andá a{" "}
            <Link href="/control-precios/comparacion" className="underline hover:text-slate-900">
              Comparar proveedores
            </Link>
            .
          </p>
        </div>
        <Link
          href="/control-precios/comparacion/sustitutos"
          className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Buscar sustitutos más baratos →
        </Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Los precios de acá abajo son siempre de la <strong>lista vigente</strong> de cada proveedor — nunca de la
        última factura real, aunque exista: comparar una factura vieja de un lado contra una más nueva del otro
        favorece al que hace más tiempo que no se compra, así que los dos lados se miran siempre a la misma fecha
        (hoy). A El Criollo se le resta el {DESCUENTO_LISTA_EL_CRIOLLO}% combinado de descuento (10% de lista + 6%
        adicional que aplican sobre el total con IVA, no por ítem). La fecha de "última compra real" que se muestra
        junto a cada producto es solo informativa — indica si ya se lo compramos alguna vez, no cambia el precio.
      </div>

      <SeccionColapsable titulo="Comparación de precios — El Criollo ↔ El Emporio">
        <TablaComparacionProveedores filas={comparacion} />
      </SeccionColapsable>

      <SeccionColapsable titulo="Variación de lista — El Criollo (última importación vs. anterior)" defaultAbierta={false}>
        <p className="mb-2 max-w-3xl text-sm text-slate-500">
          Solo productos vinculados a nuestro catálogo (los que ya compramos) — no se muestran renglones del
          catálogo de El Criollo que no nos interesan. Ambos precios ya tienen descontado el{" "}
          {DESCUENTO_LISTA_EL_CRIOLLO}% combinado de lista. A partir de +{UMBRAL_RECOMENDACION_SUSTITUTO}% de aumento
          se busca automáticamente un sustituto más barato del mismo proveedor.
        </p>
        <TablaDeltaListaMismoProveedor
          filas={deltaCriollo}
          umbralAlerta={UMBRAL_ALERTA_PRECIO}
          umbralRecomendacion={UMBRAL_RECOMENDACION_SUSTITUTO}
          proveedorId={criolloId}
          sustitutosPorListaId={sustitutosPorListaId}
        />
      </SeccionColapsable>

      <SeccionColapsable titulo="Variación de lista — El Emporio (última importación vs. anterior)" defaultAbierta={false}>
        <p className="mb-2 max-w-3xl text-sm text-slate-500">
          Solo productos vinculados a nuestro catálogo (los que ya compramos) — precio con bonificación de lista. A
          partir de +{UMBRAL_RECOMENDACION_SUSTITUTO}% de aumento se busca automáticamente un sustituto más barato ya
          confirmado del mismo proveedor.
        </p>
        <TablaDeltaListaMismoProveedor
          filas={deltaEmporio}
          umbralAlerta={UMBRAL_ALERTA_PRECIO}
          umbralRecomendacion={UMBRAL_RECOMENDACION_SUSTITUTO}
          proveedorId={emporioId}
          sustitutosPorListaId={sustitutosPorListaId}
        />
      </SeccionColapsable>
    </div>
  );
}
