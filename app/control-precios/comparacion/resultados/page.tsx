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
        Precio de El Criollo <strong>real ajustado</strong> (ya lo compraron): el precio_unitario de la factura solo
        trae el 10% de descuento de lista — se le resta un 6% más para completar el {DESCUENTO_LISTA_EL_CRIOLLO}%
        combinado que realmente paga El Criollo (el 6% adicional lo aplican sobre el total con IVA de la factura, no
        por ítem, pero el precio mostrado ya lo tiene en cuenta). Precio <strong>estimado</strong> (sin compra real
        todavía): se le resta directo el {DESCUENTO_LISTA_EL_CRIOLLO}% al precio de lista.
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
