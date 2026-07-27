"use client";

import { formatoFecha, formatoMoneda } from "@/lib/formato";
import type { FilaDeltaPrecio } from "@/lib/control-precios/consultas";
import { useMemo, useState } from "react";

type Grupo = { proveedorId: number; proveedorNombre: string; items: FilaDeltaPrecio[] };

/** Agrupa preservando el orden de llegada: `deltas` ya viene ordenado por
 * porcentajeAumento DESC desde la consulta, así que el primer proveedor insertado
 * en el Map es el que tiene el ítem con mayor aumento — el orden de los grupos
 * queda naturalmente alineado con dónde están las alertas más fuertes. */
function agruparPorProveedor(deltas: FilaDeltaPrecio[]): Grupo[] {
  const mapa = new Map<number, Grupo>();
  for (const d of deltas) {
    const grupo = mapa.get(d.proveedorId);
    if (grupo) grupo.items.push(d);
    else mapa.set(d.proveedorId, { proveedorId: d.proveedorId, proveedorNombre: d.proveedorNombre, items: [d] });
  }
  return [...mapa.values()];
}

export function TablaDeltaPreciosPorProveedor({
  deltas,
  umbralAlerta,
}: {
  deltas: FilaDeltaPrecio[];
  umbralAlerta: number;
}) {
  const grupos = useMemo(() => agruparPorProveedor(deltas), [deltas]);
  // Arranca con el primer grupo (el que tiene la alerta más fuerte) abierto y el
  // resto colapsado, para no volver a la sopa de filas sueltas que el usuario
  // señaló como confusa.
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(grupos[0] ? [grupos[0].proveedorId] : []));
  const [busqueda, setBusqueda] = useState("");

  const terminoBusqueda = busqueda.trim().toLowerCase();
  // Filtra por nombre de producto dentro de cada proveedor — no toca `grupos`
  // (que sigue mandando el orden/las alertas), solo qué filas se muestran.
  const gruposFiltrados = useMemo(() => {
    if (!terminoBusqueda) return grupos;
    return grupos
      .map((g) => ({ ...g, items: g.items.filter((d) => d.productoNombre.toLowerCase().includes(terminoBusqueda)) }))
      .filter((g) => g.items.length > 0);
  }, [grupos, terminoBusqueda]);

  if (deltas.length === 0) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <p className="px-3 py-6 text-center text-sm text-slate-400">
          No hay compras registradas en este período con los filtros elegidos.
        </p>
      </div>
    );
  }

  function alternar(proveedorId: number) {
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
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400 shadow-sm">
          Ningún producto de este período coincide con &quot;{busqueda.trim()}&quot;.
        </p>
      )}

      {gruposFiltrados.map((grupo) => {
        // Con una búsqueda activa se fuerza a abierto: si no, un grupo colapsado
        // escondería el resultado justo que se está buscando.
        const abierto = terminoBusqueda ? true : abiertos.has(grupo.proveedorId);
        const alertas = grupo.items.filter(
          (d) => d.porcentajeAumento !== null && Number(d.porcentajeAumento) >= umbralAlerta
        ).length;

        return (
          <div key={grupo.proveedorId} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => alternar(grupo.proveedorId)}
              className="flex w-full items-center gap-3 bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
            >
              <span className="text-slate-400">{abierto ? "▾" : "▸"}</span>
              <span className="text-sm font-semibold text-slate-900">{grupo.proveedorNombre}</span>
              <span className="text-xs text-slate-500">
                {grupo.items.length} producto{grupo.items.length === 1 ? "" : "s"}
              </span>
              {alertas > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                  {alertas} alerta{alertas === 1 ? "" : "s"}
                </span>
              )}
            </button>

            {abierto && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr className="border-t border-slate-100">
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">Restaurante</th>
                      <th className="px-3 py-2">Categoría</th>
                      <th className="px-3 py-2 text-right">Precio anterior</th>
                      <th className="px-3 py-2 text-right">Precio actual</th>
                      <th className="px-3 py-2 text-right">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.items.map((d) => (
                      <FilaDelta key={`${d.productoId}-${d.localId ?? "sin-local"}`} d={d} umbralAlerta={umbralAlerta} />
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

function FilaDelta({ d, umbralAlerta }: { d: FilaDeltaPrecio; umbralAlerta: number }) {
  const porcentaje = d.porcentajeAumento !== null ? Number(d.porcentajeAumento) : null;
  const esAlerta = porcentaje !== null && porcentaje >= umbralAlerta;
  const subioAlgo = porcentaje !== null && porcentaje > 0;
  const bajoAlgo = porcentaje !== null && porcentaje < 0;

  return (
    <tr className={`border-t border-slate-100 ${esAlerta ? "bg-rose-50" : ""}`}>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{d.productoNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{d.localNombre ?? "Sin asignar"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{d.categoria}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-500">{d.precioBase ? formatoMoneda(d.precioBase) : "—"}</div>
        {d.fechaBase && <div className="text-xs text-slate-400">{formatoFecha(d.fechaBase)}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(d.precioActual)}</div>
        <div className="text-xs text-slate-400">{formatoFecha(d.fechaActual)}</div>
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
          subioAlgo ? "text-rose-600" : bajoAlgo ? "text-emerald-600" : "text-slate-400"
        }`}
      >
        {porcentaje !== null ? `${porcentaje > 0 ? "+" : ""}${porcentaje}%` : "sin comparación"}
      </td>
    </tr>
  );
}
