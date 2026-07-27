import { KpiTile } from "@/components/KpiTile";
import { FiltrosReportePrecios } from "@/components/FiltrosReportePrecios";
import { TablaDeltaPreciosPorProveedor } from "@/components/TablaDeltaPreciosPorProveedor";
import { TablaHistorialCompras } from "@/components/TablaHistorialCompras";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import {
  obtenerComparacionEntreRestaurantes,
  obtenerDeltaPrecios,
  obtenerGastoPorCategoria,
  obtenerGastoTotalPeriodo,
  obtenerHistorialComprasPorProducto,
  obtenerLocales,
  obtenerProveedores,
  parseLocalIds,
  quincenaActual,
  type ComparacionEntreRestaurantes,
} from "@/lib/control-precios/consultas";
import { UMBRAL_ALERTA_PRECIO } from "@/lib/control-precios/constantes";
import type { CategoriaInsumo } from "@/app/control-precios/actions";

// A partir de este % de aumento, una fila se resalta como alerta fuerte.
const UMBRAL_ALERTA = UMBRAL_ALERTA_PRECIO;

export default async function ReportePreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; local?: string; proveedor?: string; categoria?: string }>;
}) {
  const params = await searchParams;
  const defaultQuincena = quincenaActual();
  const desde = params.desde || defaultQuincena.desde;
  const hasta = params.hasta || defaultQuincena.hasta;
  const localIds = parseLocalIds(params.local);
  const proveedorId = params.proveedor ? Number(params.proveedor) : undefined;
  const categoria = (params.categoria as CategoriaInsumo | undefined) || undefined;

  const filtros = { desde, hasta, localIds, proveedorId, categoria };

  const [locales, proveedores, deltas, gastoTotal, gastoPorCategoria, comparacionRestaurantes, historialCompras] =
    await Promise.all([
      obtenerLocales(),
      obtenerProveedores(),
      obtenerDeltaPrecios(filtros),
      obtenerGastoTotalPeriodo(filtros),
      obtenerGastoPorCategoria(filtros),
      obtenerComparacionEntreRestaurantes(),
      obtenerHistorialComprasPorProducto(filtros),
    ]);

  const conAumento = deltas.filter((d) => d.porcentajeAumento !== null);
  const alertas = conAumento.filter((d) => Number(d.porcentajeAumento) >= UMBRAL_ALERTA);
  const mayorAumento = conAumento[0]; // ya viene ordenado DESC por porcentajeAumento

  const gastoSinVerificarTotal = historialCompras.reduce((acc, f) => acc + f.gastoSinVerificar, 0);
  const itemsSinVerificarTotal = historialCompras.reduce((acc, f) => acc + f.itemsSinVerificar, 0);

  const queryExport = new URLSearchParams({
    desde,
    hasta,
    ...(localIds && localIds.length > 0 ? { local: localIds.join(",") } : {}),
    ...(proveedorId ? { proveedor: String(proveedorId) } : {}),
    ...(categoria ? { categoria } : {}),
  }).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Reporte de precios</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Comparación de precio unitario por producto entre el inicio y el fin del período elegido —{" "}
            {formatoFecha(desde)} al {formatoFecha(hasta)}. Cuando hay un precio anterior al período, se compara
            contra ese; si es la primera vez que se registra el producto, se compara contra el primer precio visto
            dentro del propio período.
          </p>
        </div>
        <a
          href={`/api/control-precios/exportar-reporte?${queryExport}`}
          className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Exportar a Excel
        </a>
      </div>

      <FiltrosReportePrecios locales={locales} proveedores={proveedores} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Gasto total del período" valor={formatoMoneda(gastoTotal)} />
        <KpiTile
          label="Mayor aumento"
          valor={mayorAumento ? `${mayorAumento.productoNombre} +${mayorAumento.porcentajeAumento}%` : "—"}
          color={mayorAumento ? "malo" : "neutro"}
        />
        <KpiTile
          label={`Alertas (≥${UMBRAL_ALERTA}%)`}
          valor={String(alertas.length)}
          color={alertas.length > 0 ? "malo" : "bueno"}
        />
      </div>

      {gastoPorCategoria.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Gasto por categoría</h2>
          <div className="space-y-2">
            {gastoPorCategoria.map((g) => {
              const porcentaje = gastoTotal > 0 ? (g.total / gastoTotal) * 100 : 0;
              return (
                <div key={g.categoria} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-slate-600">{g.categoria}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-950" style={{ width: `${porcentaje}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs text-slate-500">{formatoMoneda(g.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {comparacionRestaurantes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-rose-200 bg-rose-50 shadow-sm">
          <div className="px-4 pt-3">
            <h2 className="text-sm font-semibold text-rose-900">
              Mismo proveedor, distinto precio entre restaurantes ({comparacionRestaurantes.length})
            </h2>
            <p className="mb-2 text-xs text-rose-700">
              Compara el último precio conocido por restaurante — solo cuando las dos compras están a una semana o
              menos de diferencia entre sí, para no confundir un precio distinto con un dato desactualizado. Podés
              abrir el comprobante de cada lado para comparar a simple vista.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-rose-700">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Más barato en</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Más caro en</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {comparacionRestaurantes.map((c) => (
                <FilaComparacionRestaurantes key={c.productoId} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TablaDeltaPreciosPorProveedor deltas={deltas} umbralAlerta={UMBRAL_ALERTA} />

      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-slate-950">Cantidades compradas</h2>
        <p className="mb-3 max-w-3xl text-sm text-slate-500">
          Cuánto se compró de cada producto y cuánto se pagó en total durante el período — a diferencia de la tabla de
          arriba (que compara el precio de inicio contra el de fin), acá se suman todas las compras registradas. Para
          Distribuidora El Criollo SRL y HORECA SRL, el precio y el gasto ya tienen aplicado el 6% adicional que
          facturan sobre el total (no están tal cual figuran en el precio_unitario de la factura) — el resto de los
          proveedores se muestra sin ajustar.
        </p>
        {gastoSinVerificarTotal > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span className="font-semibold">{formatoMoneda(gastoSinVerificarTotal)}</span> en {itemsSinVerificarTotal}{" "}
            renglón{itemsSinVerificarTotal === 1 ? "" : "es"} con descuento propio que no reconcilia contra el
            subtotal impreso en el papel — esa plata queda fuera del &quot;Gasto verificado&quot; de cada producto
            hasta revisarla contra el comprobante original.
          </div>
        )}
        <TablaHistorialCompras filas={historialCompras} />
      </div>
    </div>
  );
}

function FilaComparacionRestaurantes({ c }: { c: ComparacionEntreRestaurantes }) {
  return (
    <tr className="border-t border-rose-100">
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{c.productoNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.proveedorNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
        <div>{c.localMasBarato}</div>
        <div className="text-xs text-slate-400">{formatoFecha(c.fechaMasBarato)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-emerald-600">{formatoMoneda(c.precioMinimo)}</div>
        <a
          href={`/api/control-precios/ver-comprobante/${c.facturaIdMasBarato}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 underline hover:text-slate-900"
        >
          Ver factura
        </a>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
        <div>{c.localMasCaro}</div>
        <div className="text-xs text-slate-400">{formatoFecha(c.fechaMasCaro)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-rose-600">{formatoMoneda(c.precioMaximo)}</div>
        <a
          href={`/api/control-precios/ver-comprobante/${c.facturaIdMasCaro}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 underline hover:text-slate-900"
        >
          Ver factura
        </a>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-rose-700">
        +{c.porcentajeDiferencia}%
      </td>
    </tr>
  );
}
