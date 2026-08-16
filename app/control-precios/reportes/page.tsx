import { KpiTile } from "@/components/KpiTile";
import { FiltrosReportePrecios } from "@/components/FiltrosReportePrecios";
import { TablaComparacionRestaurantes } from "@/components/TablaComparacionRestaurantes";
import { TablaDeltaPreciosPorProveedor } from "@/components/TablaDeltaPreciosPorProveedor";
import { TablaHistorialCompras } from "@/components/TablaHistorialCompras";
import { TablaAlertasPrecio } from "@/components/TablaAlertasPrecio";
import { TablaRenglonesSinVerificar, type RenglonSinVerificar } from "@/components/TablaRenglonesSinVerificar";
import { GraficoGastoPorProveedor } from "@/components/GraficoGastoPorProveedor";
import { GraficoGastoPorCategoria } from "@/components/GraficoGastoPorCategoria";
import { GraficoTopProductos } from "@/components/GraficoTopProductos";
import { Tabs } from "@/components/Tabs";
import { InfoTooltip } from "@/components/InfoTooltip";
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
  parseProveedorIds,
  quincenaActual,
} from "@/lib/control-precios/consultas";
import { UMBRAL_ALERTA_PRECIO } from "@/lib/control-precios/constantes";
import type { CategoriaInsumo } from "@/app/control-precios/actions";

// A partir de este % de aumento, una fila se resalta como alerta fuerte.
const UMBRAL_ALERTA = UMBRAL_ALERTA_PRECIO;

type TabReporte = "resumen" | "auditoria" | "comparativo";

export default async function ReportePreciosPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    local?: string;
    proveedor?: string;
    categoria?: string;
    tab?: string;
  }>;
}) {
  const params = await searchParams;
  const defaultQuincena = quincenaActual();
  const desde = params.desde || defaultQuincena.desde;
  const hasta = params.hasta || defaultQuincena.hasta;
  const localIds = parseLocalIds(params.local);
  const proveedorIds = parseProveedorIds(params.proveedor);
  const categoria = (params.categoria as CategoriaInsumo | undefined) || undefined;
  const activeTab: TabReporte =
    params.tab === "auditoria" || params.tab === "comparativo" ? params.tab : "resumen";

  const filtros = { desde, hasta, localIds, proveedorIds, categoria };

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

  // Mismo dato que ya alimenta el banner ámbar y los badges "sin verificar" de
  // TablaHistorialCompras (compras[].verificado === false) — acá aplanado a una
  // lista por renglón para la pestaña de Auditoría, sin ninguna consulta nueva.
  const renglonesSinVerificar: RenglonSinVerificar[] = historialCompras.flatMap((f) =>
    f.compras
      .filter((c) => c.verificado === false)
      .map((c) => ({
        productoNombre: f.productoNombre,
        proveedorNombre: f.proveedorNombre,
        unidadMedida: f.unidadMedida,
        localNombre: c.localNombre,
        facturaId: c.facturaId,
        fechaEmision: c.fechaEmision,
        cantidad: c.cantidad,
        subtotalCalculado: c.subtotal,
        subtotalImpreso: c.subtotalImpreso,
      }))
  );

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
    ...(proveedorIds && proveedorIds.length > 0 ? { proveedor: proveedorIds.join(",") } : {}),
    ...(categoria ? { categoria } : {}),
  }).toString();

  const contadorAuditoria = alertas.length + comparacionRestaurantes.length + itemsSinVerificarTotal;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Reporte de precios</h1>
            <InfoTooltip texto="Comparación de precio unitario por producto entre el inicio y el fin del período elegido. Cuando hay un precio anterior al período, se compara contra ese; si es la primera vez que se registra el producto, se compara contra el primer precio visto dentro del propio período." />
          </div>
          <p className="text-sm text-slate-500">
            {formatoFecha(desde)} al {formatoFecha(hasta)}
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

      <Tabs
        activo={activeTab}
        tabs={[
          { valor: "resumen", etiqueta: "📊 Resumen de gastos" },
          { valor: "auditoria", etiqueta: "🚨 Auditoría y alertas", contador: contadorAuditoria },
          { valor: "comparativo", etiqueta: "⚖️ Comparativo por proveedor" },
        ]}
      />

      {activeTab === "resumen" && (
        <div className="space-y-6">
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
              valor={mayorAumento ? `+${mayorAumento.porcentajeAumento}%` : "—"}
              color={mayorAumento ? "malo" : "neutro"}
              subtitulo={mayorAumento ? `${mayorAumento.productoNombre} · ${mayorAumento.proveedorNombre}` : undefined}
              badge={
                mayorAumento
                  ? Number(mayorAumento.porcentajeAumento) >= UMBRAL_ALERTA
                    ? { texto: "Crítico", color: "rojo" }
                    : { texto: "Revisar", color: "ambar" }
                  : undefined
              }
            />
            <KpiTile
              label={`Alertas (≥${UMBRAL_ALERTA}%)`}
              valor={String(alertas.length)}
              color={alertas.length > 0 ? "malo" : "bueno"}
              badge={alertas.length > 0 ? { texto: "revisar", color: "rojo" } : { texto: "al día", color: "verde" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {gastoPorProveedorGrafico.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Gasto por proveedor</h2>
                <GraficoGastoPorProveedor datos={gastoPorProveedorGrafico} />
              </div>
            )}
            {gastoPorCategoria.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Gasto por categoría</h2>
                <GraficoGastoPorCategoria datos={gastoPorCategoria} />
              </div>
            )}
          </div>

          {topProductosGrafico.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-slate-900">
                  Top {topProductosGrafico.length} productos por gasto
                </h2>
                <InfoTooltip texto="Dónde se concentra la plata del período — el principio 80/20 aplicado a las compras." />
              </div>
              <GraficoTopProductos datos={topProductosGrafico} />
            </div>
          )}
        </div>
      )}

      {activeTab === "auditoria" && (
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Aumentos ≥{UMBRAL_ALERTA}%</h2>
              <InfoTooltip texto={`Productos cuyo precio subió ${UMBRAL_ALERTA}% o más entre el inicio y el fin del período elegido.`} />
            </div>
            <TablaAlertasPrecio alertas={alertas} umbralAlerta={UMBRAL_ALERTA} />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Diferencias entre restaurantes</h2>
              <InfoTooltip texto="Mismo proveedor, mismo producto, precio distinto según el restaurante — solo cuando las dos compras están a una semana o menos de diferencia entre sí." />
            </div>
            <TablaComparacionRestaurantes
              activos={comparacionRestaurantes}
              archivados={comparacionesRestaurantesRevisadas}
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Renglones sin verificar</h2>
              <InfoTooltip texto={`Renglones con descuento propio cuyo subtotal calculado no reconcilia contra el subtotal impreso en el papel (o no hay subtotal impreso para comparar) — esa plata queda fuera del "Gasto verificado" de cada producto hasta revisarla contra el comprobante original.`} />
            </div>
            <TablaRenglonesSinVerificar renglones={renglonesSinVerificar} />
          </section>
        </div>
      )}

      {activeTab === "comparativo" && (
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Delta de precio por proveedor</h2>
              <InfoTooltip texto="Precio anterior, precio actual y % de variación de cada producto, agrupado por proveedor." />
            </div>
            <TablaDeltaPreciosPorProveedor deltas={deltas} umbralAlerta={UMBRAL_ALERTA} />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Cantidades compradas</h2>
              <InfoTooltip texto="Cuánto se compró de cada producto y cuánto se pagó en total durante el período — a diferencia de la tabla de arriba (que compara el precio de inicio contra el de fin), acá se suman todas las compras registradas. Para Distribuidora El Criollo SRL y HORECA SRL, el precio y el gasto ya tienen aplicado el 6% adicional que facturan sobre el total — el resto de los proveedores se muestra sin ajustar." />
            </div>
            {gastoSinVerificarTotal > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                <span className="font-semibold">{formatoMoneda(gastoSinVerificarTotal)}</span>
                <span>
                  en {itemsSinVerificarTotal} renglón{itemsSinVerificarTotal === 1 ? "" : "es"} sin verificar
                </span>
                <InfoTooltip texto={`Renglones con descuento propio que no reconcilian contra el subtotal impreso en el papel — esa plata queda fuera del "Gasto verificado" de cada producto hasta revisarla contra el comprobante original. Ver detalle en la pestaña de Auditoría.`} />
              </div>
            )}
            <TablaHistorialCompras filas={historialCompras} />
          </section>
        </div>
      )}
    </div>
  );
}
