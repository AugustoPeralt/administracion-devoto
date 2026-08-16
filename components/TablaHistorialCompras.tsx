"use client";

import { formatoFecha, formatoMoneda } from "@/lib/formato";
import type { FilaHistorialCompras } from "@/lib/control-precios/consultas";
import Link from "next/link";
import { useMemo, useState } from "react";

type Grupo = { proveedorId: number; proveedorNombre: string; items: FilaHistorialCompras[] };

/** Agrupa preservando el orden de llegada: `filas` ya viene ordenado por
 * gastoVerificado DESC desde la consulta, así que el primer proveedor insertado en
 * el Map es el que tiene el producto con más plata comprobada en juego. */
function agruparPorProveedor(filas: FilaHistorialCompras[]): Grupo[] {
  const mapa = new Map<number, Grupo>();
  for (const f of filas) {
    const grupo = mapa.get(f.proveedorId);
    if (grupo) grupo.items.push(f);
    else mapa.set(f.proveedorId, { proveedorId: f.proveedorId, proveedorNombre: f.proveedorNombre, items: [f] });
  }
  return [...mapa.values()];
}

function formatoCantidad(cantidad: number): string {
  return cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function TablaHistorialCompras({ filas }: { filas: FilaHistorialCompras[] }) {
  // Base fija para el "% del gasto total": la suma de TODOS los productos del
  // período/filtros elegidos, sin importar qué se esté buscando en la caja de
  // texto — así el porcentaje de cada producto no cambia solo por tipear en el
  // buscador.
  const gastoTotalGeneral = useMemo(() => filas.reduce((acc, f) => acc + f.gastoVerificado, 0), [filas]);
  const grupos = useMemo(() => agruparPorProveedor(filas), [filas]);
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(grupos[0] ? [grupos[0].proveedorId] : []));
  const [expandidoProducto, setExpandidoProducto] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const terminoBusqueda = busqueda.trim().toLowerCase();
  const gruposFiltrados = useMemo(() => {
    if (!terminoBusqueda) return grupos;
    return grupos
      .map((g) => ({ ...g, items: g.items.filter((f) => f.productoNombre.toLowerCase().includes(terminoBusqueda)) }))
      .filter((g) => g.items.length > 0);
  }, [grupos, terminoBusqueda]);

  if (filas.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <p className="px-3 py-6 text-center text-sm text-slate-400">
          No hay compras registradas en este período con los filtros elegidos.
        </p>
      </div>
    );
  }

  function alternarGrupo(proveedorId: number) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(proveedorId)) next.delete(proveedorId);
      else next.add(proveedorId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="w-56 rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-950"
        />
        <div className="flex-1" />
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAbiertos(new Set(grupos.map((g) => g.proveedorId)))}
            className="text-slate-500 underline hover:text-slate-900"
          >
            Expandir todos
          </button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => setAbiertos(new Set())} className="text-slate-500 underline hover:text-slate-900">
            Colapsar todos
          </button>
        </div>
      </div>

      {terminoBusqueda && gruposFiltrados.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400 shadow-xs">
          Ningún producto de este período coincide con &quot;{busqueda.trim()}&quot;.
        </p>
      )}

      {gruposFiltrados.map((grupo) => {
        const abierto = terminoBusqueda ? true : abiertos.has(grupo.proveedorId);
        const gastoGrupo = grupo.items.reduce((acc, f) => acc + f.gastoVerificado, 0);
        const sinVerificarGrupo = grupo.items.reduce((acc, f) => acc + f.gastoSinVerificar, 0);

        return (
          <div key={grupo.proveedorId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => alternarGrupo(grupo.proveedorId)}
              className="flex w-full items-center gap-3 bg-slate-50/75 px-3 py-2.5 text-left hover:bg-slate-100"
            >
              <span className="text-slate-400">{abierto ? "▾" : "▸"}</span>
              <span className="text-sm font-semibold text-slate-900">{grupo.proveedorNombre}</span>
              <span className="text-xs text-slate-500">
                {grupo.items.length} producto{grupo.items.length === 1 ? "" : "s"}
              </span>
              <span className="font-mono text-xs text-slate-400">{formatoMoneda(gastoGrupo)}</span>
              {sinVerificarGrupo > 0 && (
                <span
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                  title="Suma de renglones con descuento propio cuyo subtotal calculado no coincide con el impreso en el papel (o no hay subtotal impreso para comparar) — no está incluida en el gasto de arriba."
                >
                  +{formatoMoneda(sinVerificarGrupo)} sin verificar
                </span>
              )}
            </button>

            {abierto && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cantidad comprada</th>
                      <th className="px-3 py-2 text-right">Gasto verificado</th>
                      <th className="px-3 py-2 text-right">% del gasto total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.items.map((f) => (
                      <FilaProducto
                        key={f.productoId}
                        f={f}
                        gastoTotalGeneral={gastoTotalGeneral}
                        expandido={expandidoProducto === f.productoId}
                        onToggle={() => setExpandidoProducto((prev) => (prev === f.productoId ? null : f.productoId))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilaProducto({
  f,
  gastoTotalGeneral,
  expandido,
  onToggle,
}: {
  f: FilaHistorialCompras;
  gastoTotalGeneral: number;
  expandido: boolean;
  onToggle: () => void;
}) {
  const porcentajeDelTotal = gastoTotalGeneral > 0 ? (f.gastoVerificado / gastoTotalGeneral) * 100 : 0;
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50/80">
        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{f.productoNombre}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
          {formatoCantidad(f.cantidadTotal)} {f.unidadMedida}
          {f.itemsSinPrecio > 0 && (
            <span
              className="ml-1 text-xs font-normal text-amber-600"
              title={`${f.itemsSinPrecio} compra(s) sin precio registrado, no entran en el gasto ni en el promedio`}
            >
              ({f.itemsSinPrecio} sin precio)
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.gastoVerificado)}</div>
          {f.gastoSinVerificar > 0 && (
            <div
              className="text-xs font-medium text-amber-600"
              title="Renglones con descuento propio que no reconcilian contra el subtotal impreso — no incluidos en el gasto verificado."
            >
              +{formatoMoneda(f.gastoSinVerificar)} sin verificar
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
          {porcentajeDelTotal.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <button type="button" onClick={onToggle} className="text-xs text-slate-500 underline hover:text-slate-900">
            {expandido ? "Ocultar" : `Ver ${f.compras.length} compra${f.compras.length === 1 ? "" : "s"}`}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr className="border-t border-slate-100 bg-slate-50/75">
          <td colSpan={5} className="px-3 py-2">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-left text-slate-400">
                <tr>
                  <th className="px-2 py-1">Fecha</th>
                  <th className="px-2 py-1">Restaurante</th>
                  <th className="px-2 py-1 text-right">Cantidad</th>
                  <th className="px-2 py-1 text-right">Precio unitario</th>
                  <th className="px-2 py-1 text-right">Subtotal</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {f.compras.map((c, i) => (
                  <tr key={`${c.facturaId}-${i}`} className="border-t border-slate-200 hover:bg-slate-100/80">
                    <td className="whitespace-nowrap px-2 py-1 text-slate-600">{formatoFecha(c.fechaEmision)}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-slate-600">{c.localNombre ?? "Sin asignar"}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums text-slate-700">
                      {formatoCantidad(Number(c.cantidad))} {f.unidadMedida}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums text-slate-700">
                      {c.precioUnitario !== null ? formatoMoneda(c.precioUnitario) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums text-slate-700">
                      {c.subtotal !== null ? formatoMoneda(c.subtotal) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      {c.verificado === false && (
                        <span
                          className="mr-1.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                          title={`Tiene descuento propio y no reconcilia contra el subtotal impreso${
                            c.subtotalImpreso !== null ? ` (${formatoMoneda(c.subtotalImpreso)})` : " (no hay subtotal impreso extraído)"
                          } — no está incluido en el gasto verificado.`}
                        >
                          sin verificar
                        </span>
                      )}
                      <Link
                        href={`/control-precios/facturas/${c.facturaId}`}
                        className="text-xs text-slate-500 underline hover:text-slate-900"
                      >
                        Corregir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
