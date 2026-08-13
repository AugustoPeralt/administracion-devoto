import { KpiTile } from "@/components/KpiTile";
import { FiltrosReportePrecios } from "@/components/FiltrosReportePrecios";
import { TablaComparacionRestaurantes } from "@/components/TablaComparacionRestaurantes";
import { TablaDeltaPreciosPorProveedor } from "@/components/TablaDeltaPreciosPorProveedor";
import { TablaHistorialCompras } from "@/components/TablaHistorialCompras";
import { GraficoGastoPorProveedor } from "@/components/GraficoGastoPorProveedor";
import { GraficoGastoPorCategoria } from "@/components/GraficoGastoPorCategoria";
import { GraficoTopProductos } from "@/components/GraficoTopProductos";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import {
  obtenerComparacionEntreRestaurantes,
  obtenerComparacionesRestaurantesRevisadas,
  obtenerDeltaPrecios,
  obtenerGastoPorCategoria,
  obtenerGastoTotalPeriodo,
  obtenerHistorialComprasPorProducto,
  obtenerLocales,
  obtenerProveedores,
  parseLocalIds,
  quincenaActual,
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

  const [
    locales,
    proveedores,
    deltas,
    gastoTotal,
    gastoPorCategoria,
    comparacionRestaurantes,
    comparacionesRestaurantesRevisadas,
    historialCompras,
  ] = await Promise.all([
    obtenerLocales(),
    obtenerProveedores(),
    obtenerDeltaPrecios(filtros),
    obtenerGastoTotalPeriodo(filtros),
    obtenerGastoPorCategoria(filtros),
    obtenerComparacionEntreRestaurantes(),
    obtenerComparacionesRestaurantesRevisadas(),
    obtenerHistorialComprasPorProducto(filtros),
  ]);

  const conAumento = deltas.filter((d) => d.porcentajeAumento !== null);
  const alertas = conAumento.filter((d) => Number(d.porcentajeAumento) >= UMBRAL_ALERTA);
  const mayorAumento = conAumento[0]; // ya viene ordenado DESC por porcentajeAumento

  const gastoSinVerificarTotal = historialCompras.reduce((acc, f) => acc + f.gastoSinVerificar, 0);
  const itemsSinVerificarTotal = historialCompras.reduce((acc, f) => acc + f.itemsSinVerificar, 0);

  // Agregaciones para los gráficos — derivadas de historialCompras (ya
  // fetcheado arriba, un renglón por producto), no son consultas nuevas. Solo
  // gastoVerificado entra a la cuenta, mismo criterio que el resto del
  // reporte: la plata sin verificar no se mezcla en un número de decisión.
  const gastoPorProveedorMap = new Map<string, number>();
  for (const f of historialCompras) {
    gastoPorProveedorMap.set(f.proveedorNombre, (gastoPorProveedorMap.get(f.proveedorNombre) ?? 0) + f.gastoVerificado);
  }
  const gastoPorProveedor = [...gastoPorProveedorMap.entries()]
    .map(([proveedorNombre, gasto]) => ({ proveedorNombre, gasto }))
    .sort((a, b) => b.gasto - a.gasto);
  const proveedorConMayorGasto = gastoPorProveedor[0];
  const gastoVerificadoTotal = historialCompras.reduce((acc, f) => acc + f.gastoVerificado, 0);
  const porcentajeProveedorTop =
    proveedorConMayorGasto && gastoVerificadoTotal > 0 ? (proveedorConMayorGasto.gasto / gastoVerificadoTotal) * 100 : 0;

  const CANTIDAD_TOP_PROVEEDORES_GRAFICO = 12;
  const CANTIDAD_TOP_PRODUCTOS_GRAFICO = 10;
  const gastoPorProveedorGrafico = gastoPorProveedor.slice(0, CANTIDAD_TOP_PROVEEDORES_GRAFICO);
  const topProductosGrafico = [...historialCompras]
    .sort((a, b) => b.gastoVerificado - a.gastoVerificado)
    .slice(0, CANTIDAD_TOP_PRODUCTOS_GRAFICO)
    .map((f) => ({
      productoNombre: f.productoNombre,
      gasto: f.gastoVerificado,
      cantidad: f.cantidadVerificada,
      unidadMedida: f.unidadMedida,
    }));

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Gasto total del período" valor={formatoMoneda(gastoTotal)} />
        <KpiTile
          label="Proveedor con mayor gasto"
          valor={
            proveedorConMayorGasto
              ? `${proveedorConMayorGasto.proveedorNombre} (${porcentajeProveedorTop.toFixed(0)}%)`
              : "—"
          }
        />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gastoPorProveedorGrafico.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Gasto por proveedor</h2>
            <GraficoGastoPorProveedor datos={gastoPorProveedorGrafico} />
          </div>
        )}
        {gastoPorCategoria.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Gasto por categoría</h2>
            <GraficoGastoPorCategoria datos={gastoPorCategoria} />
          </div>
        )}
      </div>

      {topProductosGrafico.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            Top {topProductosGrafico.length} productos por gasto
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Dónde se concentra la plata del período — el principio 80/20 aplicado a las compras.
          </p>
          <GraficoTopProductos datos={topProductosGrafico} />
        </div>
      )}

      <TablaComparacionRestaurantes activos={comparacionRestaurantes} archivados={comparacionesRestaurantesRevisadas} />

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
