import { auth } from "@/auth";
import {
  obtenerDeltaPrecios,
  obtenerGastoPorCategoria,
  obtenerGastoTotalPeriodo,
  obtenerHistorialComprasPorProducto,
  parseLocalIds,
  precioRealAjustado,
  quincenaActual,
  type FiltrosReporte,
} from "@/lib/control-precios/consultas";
import { UMBRAL_ALERTA_PRECIO } from "@/lib/control-precios/constantes";
import type { CategoriaInsumo } from "@/app/control-precios/actions";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

const COLOR_ALERTA = "FFFCE4E4"; // mismo tono rosa que la fila de alerta en la pantalla de Reportes
const COLOR_ALERTA_LEVE = "FFFEF3C7"; // ámbar claro — aumento notorio pero por debajo del umbral fuerte
const COLOR_SIN_VERIFICAR = "FFFEF3C7"; // mismo ámbar — plata que no se pudo comprobar contra el papel
const COLOR_ENCABEZADO = "FF0F172A"; // slate-950, igual que el resto de la UI
const COLOR_TEXTO_ALERTA = "FFB91C1C"; // rojo-700, para que el % se lea aunque se imprima en blanco y negro
const FORMATO_FECHA = "dd/mm/yyyy";
const TOP_AUMENTOS_CANTIDAD = 10;

function comoFecha(fecha: string | null): Date | null {
  return fecha ? new Date(`${fecha}T00:00:00Z`) : null;
}

/**
 * Mismo alcance/filtros que la pantalla /control-precios/reportes — reutiliza las
 * mismas consultas para que el Excel muestre exactamente lo mismo que ya se ve en
 * pantalla, en un formato que se pueda mandar o abrir sin acceso al sistema.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const defaultQuincena = quincenaActual();
  const desde = url.searchParams.get("desde") || defaultQuincena.desde;
  const hasta = url.searchParams.get("hasta") || defaultQuincena.hasta;
  const proveedorIdParam = url.searchParams.get("proveedor");
  const categoriaParam = url.searchParams.get("categoria");

  const filtros: FiltrosReporte = {
    desde,
    hasta,
    localIds: parseLocalIds(url.searchParams.get("local")),
    proveedorId: proveedorIdParam ? Number(proveedorIdParam) : undefined,
    categoria: (categoriaParam as CategoriaInsumo | null) || undefined,
  };

  const [deltas, gastoTotal, gastoPorCategoria, historialCompras] = await Promise.all([
    obtenerDeltaPrecios(filtros),
    obtenerGastoTotalPeriodo(filtros),
    obtenerGastoPorCategoria(filtros),
    // agruparPorLocal=true: una fila por producto+restaurante en vez de sumar
    // todos los restaurantes juntos — cada uno es en la práctica una empresa
    // distinta, no tiene sentido mezclar su consumo a la hora de decidir
    // proveedores. Ver comentario en la función.
    obtenerHistorialComprasPorProducto(filtros, true),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Control de precios";
  workbook.created = new Date(`${desde}T00:00:00Z`);

  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [
    { header: "", key: "a", width: 28 },
    { header: "", key: "b", width: 18 },
  ];
  resumen.addRow(["Período", `${desde} a ${hasta}`]);
  resumen.addRow(["Gasto total", Number(gastoTotal)]);
  resumen.addRow([]);
  resumen.addRow(["Gasto por categoría", ""]).font = { bold: true };
  resumen.addRow(["Categoría", "Gasto"]).font = { bold: true };
  for (const g of gastoPorCategoria) {
    resumen.addRow([g.categoria, g.total]);
  }
  resumen.getColumn("b").numFmt = '"$"#,##0';

  // precioRealAjustado (El Criollo/HORECA × 0.94) se aplica ACÁ, en el Excel, a
  // diferencia de la pantalla /control-precios/reportes — donde el usuario pidió
  // explícitamente dejar el precio crudo de factura (10%) sin el 6% adicional.
  // Para el Excel que se manda afuera pidió lo contrario: que el precio de estos
  // dos proveedores sea el mismo (15,4%) en todas las hojas, para no mostrarle a
  // su jefa dos números distintos del mismo producto según la pestaña. El %
  // variación no cambia al aplicar el factor (es una razón entre dos precios
  // multiplicados por la misma constante), por eso solo se ajustan los pesos.

  // Los aumentos más grandes primero y a la vista, sin que el destinatario tenga
  // que abrir la hoja "Precios" y buscarlos entre todas las filas.
  const topAumentos = deltas
    .filter((d) => d.porcentajeAumento !== null && Number(d.porcentajeAumento) > 0)
    .slice(0, TOP_AUMENTOS_CANTIDAD);

  if (topAumentos.length > 0) {
    resumen.addRow([]);
    resumen.addRow([`Top ${topAumentos.length} aumentos`, ""]).font = { bold: true };
    const encabezadoTop = resumen.addRow([
      "Producto",
      "Proveedor",
      "Restaurante",
      "Precio anterior",
      "Precio actual",
      "Fecha aumento",
      "% Variación",
    ]);
    encabezadoTop.font = { bold: true };

    for (const d of topAumentos) {
      const porcentaje = Number(d.porcentajeAumento);
      const fila = resumen.addRow([
        d.productoNombre,
        d.proveedorNombre,
        d.localNombre ?? "Sin asignar",
        d.precioBase !== null ? precioRealAjustado(d.proveedorNombre, Number(d.precioBase)) : null,
        precioRealAjustado(d.proveedorNombre, Number(d.precioActual)),
        comoFecha(d.fechaActual),
        porcentaje / 100,
      ]);
      fila.getCell(4).numFmt = '"$"#,##0';
      fila.getCell(5).numFmt = '"$"#,##0';
      fila.getCell(6).numFmt = FORMATO_FECHA;
      fila.getCell(7).numFmt = "+0.00%;-0.00%";
      fila.getCell(7).font = { bold: true, color: { argb: COLOR_TEXTO_ALERTA } };
      if (porcentaje >= UMBRAL_ALERTA_PRECIO) {
        fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ALERTA } };
      }
    }
    resumen.getColumn(1).width = 30;
    resumen.getColumn(2).width = 22;
    resumen.getColumn(3).width = 18;
    resumen.getColumn(4).width = 15;
    resumen.getColumn(5).width = 15;
    resumen.getColumn(6).width = 14;
    resumen.getColumn(7).width = 12;
  }

  const precios = workbook.addWorksheet("Precios");
  precios.columns = [
    { header: "Proveedor", key: "proveedor", width: 26 },
    { header: "Categoría", key: "categoria", width: 14 },
    { header: "Producto", key: "producto", width: 34 },
    { header: "Restaurante", key: "local", width: 18 },
    { header: "Precio anterior", key: "precioAnterior", width: 16 },
    { header: "Fecha anterior", key: "fechaAnterior", width: 14 },
    { header: "Precio actual", key: "precioActual", width: 16 },
    { header: "Fecha actual", key: "fechaActual", width: 14 },
    { header: "% Variación", key: "variacion", width: 12 },
  ];
  precios.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  precios.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  // Encabezado siempre visible al scrollear + filtros nativos de Excel, para que el
  // que lo recibe pueda ordenar/filtrar sin pedirnos un recorte distinto.
  precios.views = [{ state: "frozen", ySplit: 1 }];
  precios.autoFilter = { from: "A1", to: "I1" };

  for (const d of deltas) {
    const porcentaje = d.porcentajeAumento !== null ? Number(d.porcentajeAumento) : null;
    const fila = precios.addRow({
      proveedor: d.proveedorNombre,
      categoria: d.categoria,
      producto: d.productoNombre,
      local: d.localNombre ?? "Sin asignar",
      precioAnterior: d.precioBase !== null ? precioRealAjustado(d.proveedorNombre, Number(d.precioBase)) : null,
      fechaAnterior: comoFecha(d.fechaBase),
      precioActual: precioRealAjustado(d.proveedorNombre, Number(d.precioActual)),
      fechaActual: comoFecha(d.fechaActual),
      variacion: porcentaje,
    });
    fila.getCell("precioAnterior").numFmt = '"$"#,##0';
    fila.getCell("fechaAnterior").numFmt = FORMATO_FECHA;
    fila.getCell("precioActual").numFmt = '"$"#,##0';
    fila.getCell("fechaActual").numFmt = FORMATO_FECHA;
    fila.getCell("variacion").numFmt = "+0.00%;-0.00%";
    fila.getCell("variacion").value = porcentaje !== null ? porcentaje / 100 : null;

    if (porcentaje !== null && porcentaje > 0) {
      fila.getCell("precioActual").font = { bold: true };
      fila.getCell("fechaActual").font = { bold: true };
    }
    if (porcentaje !== null && porcentaje >= UMBRAL_ALERTA_PRECIO) {
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ALERTA } };
      fila.getCell("variacion").font = { bold: true, color: { argb: COLOR_TEXTO_ALERTA } };
    } else if (porcentaje !== null && porcentaje >= UMBRAL_ALERTA_PRECIO / 2) {
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ALERTA_LEVE } };
    }
  }

  const cantidades = workbook.addWorksheet("Cantidades compradas");
  cantidades.columns = [
    { header: "Empresa", key: "empresa", width: 20 },
    { header: "Proveedor", key: "proveedor", width: 26 },
    { header: "Categoría", key: "categoria", width: 14 },
    { header: "Producto", key: "producto", width: 34 },
    { header: "Unidad", key: "unidad", width: 8 },
    { header: "Cantidad comprada", key: "cantidad", width: 16 },
    { header: "Precio unitario", key: "precioUnitario", width: 16 },
    { header: "Gasto verificado", key: "gastoVerificado", width: 16 },
    { header: "Gasto sin verificar", key: "gastoSinVerificar", width: 16 },
    { header: "% del gasto total", key: "porcentajeGastoTotal", width: 16 },
  ];
  cantidades.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  cantidades.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  cantidades.views = [{ state: "frozen", ySplit: 1 }];
  cantidades.autoFilter = { from: "A1", to: "J1" };

  // Una fila por producto+restaurante (ver agruparPorLocal=true arriba) para que
  // el filtro nativo de Excel en la columna "Empresa" separe el consumo de cada
  // restaurante sin tener que volver a pedir el reporte por cada uno.
  //
  // "% del gasto total" es una FÓRMULA (no un número fijo) que usa
  // SUBTOTAL(109, ...) en vez de SUM: esa función ignora las filas que el
  // autofiltro de Excel deja ocultas, así que si el destinatario filtra por una
  // Empresa puntual en la columna A, el % se recalcula solo contra el total de
  // ESA empresa — sin filtrar nada, sigue siendo el % contra el total general.
  // Pedido explícito del usuario (2026-07-24): "el % del gasto total sería por
  // empresa también en caso de filtrar por x empresa, si mantenemos sin filtro
  // sería el % total".
  const primeraFilaDatos = 2;
  const ultimaFilaDatos = primeraFilaDatos + historialCompras.length - 1;
  const COL_GASTO_VERIFICADO = "H";

  historialCompras.forEach((f, i) => {
    const numeroFila = primeraFilaDatos + i;
    const fila = cantidades.addRow({
      empresa: f.localNombre ?? "Sin asignar",
      proveedor: f.proveedorNombre,
      categoria: f.categoria,
      producto: f.productoNombre,
      unidad: f.unidadMedida,
      cantidad: f.cantidadTotal,
      precioUnitario: f.precioUnitarioUltimo !== null ? Number(f.precioUnitarioUltimo) : null,
      gastoVerificado: f.gastoVerificado,
      gastoSinVerificar: f.gastoSinVerificar || null,
    });
    fila.getCell("cantidad").numFmt = "#,##0.00";
    fila.getCell("precioUnitario").numFmt = '"$"#,##0';
    fila.getCell("gastoVerificado").numFmt = '"$"#,##0';
    fila.getCell("gastoSinVerificar").numFmt = '"$"#,##0';
    fila.getCell("porcentajeGastoTotal").value = {
      formula: `${COL_GASTO_VERIFICADO}${numeroFila}/SUBTOTAL(109,$${COL_GASTO_VERIFICADO}$${primeraFilaDatos}:$${COL_GASTO_VERIFICADO}$${ultimaFilaDatos})`,
    };
    fila.getCell("porcentajeGastoTotal").numFmt = "0.0%";
    if (f.gastoSinVerificar > 0) {
      fila.getCell("gastoSinVerificar").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_SIN_VERIFICAR },
      };
      fila.getCell("gastoSinVerificar").font = { bold: true, color: { argb: COLOR_TEXTO_ALERTA } };
    }
  });

  // Detalle compra por compra — mismo dato que el "Ver N compras" expandible de
  // la pantalla, para poder auditar de dónde sale cada número del resumen de
  // arriba sin volver al sistema.
  const detalle = workbook.addWorksheet("Detalle de compras");
  detalle.columns = [
    { header: "Proveedor", key: "proveedor", width: 26 },
    { header: "Producto", key: "producto", width: 34 },
    { header: "Restaurante", key: "local", width: 18 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Unidad", key: "unidad", width: 8 },
    { header: "Precio unitario", key: "precioUnitario", width: 16 },
    { header: "Subtotal", key: "subtotal", width: 16 },
    { header: "Subtotal impreso", key: "subtotalImpreso", width: 16 },
    { header: "Verificado", key: "verificado", width: 12 },
  ];
  detalle.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detalle.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  detalle.views = [{ state: "frozen", ySplit: 1 }];
  detalle.autoFilter = { from: "A1", to: "J1" };

  for (const f of historialCompras) {
    for (const c of f.compras) {
      const fila = detalle.addRow({
        proveedor: f.proveedorNombre,
        producto: f.productoNombre,
        local: c.localNombre ?? "Sin asignar",
        fecha: comoFecha(c.fechaEmision),
        cantidad: Number(c.cantidad),
        unidad: f.unidadMedida,
        precioUnitario: c.precioUnitario !== null ? Number(c.precioUnitario) : null,
        subtotal: c.subtotal !== null ? Number(c.subtotal) : null,
        subtotalImpreso: c.subtotalImpreso !== null ? Number(c.subtotalImpreso) : null,
        verificado: c.verificado === null ? "—" : c.verificado ? "Sí" : "No",
      });
      fila.getCell("fecha").numFmt = FORMATO_FECHA;
      fila.getCell("cantidad").numFmt = "#,##0.00";
      fila.getCell("precioUnitario").numFmt = '"$"#,##0';
      fila.getCell("subtotal").numFmt = '"$"#,##0';
      fila.getCell("subtotalImpreso").numFmt = '"$"#,##0';
      if (c.verificado === false) {
        fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SIN_VERIFICAR } };
        fila.getCell("verificado").font = { bold: true, color: { argb: COLOR_TEXTO_ALERTA } };
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reporte-precios-${desde}_${hasta}.xlsx"`,
    },
  });
}
