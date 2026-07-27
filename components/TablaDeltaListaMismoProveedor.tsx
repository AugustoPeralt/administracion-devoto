"use client";

import type { FilaDeltaListaProveedor } from "@/lib/control-precios/consultas";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { useMemo, useState } from "react";

export function TablaDeltaListaMismoProveedor({
  filas,
  umbralAlerta,
}: {
  filas: FilaDeltaListaProveedor[];
  umbralAlerta: number;
}) {
  const [busqueda, setBusqueda] = useState("");

  const termino = busqueda.trim().toLowerCase();
  const filasFiltradas = useMemo(
    () => (termino ? filas.filter((f) => f.descripcion.toLowerCase().includes(termino)) : filas),
    [filas, termino]
  );

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Todavía no hay dos importaciones de esta lista para comparar — o ninguno de los productos de la última
        importación está vinculado a nuestro catálogo. Subí una nueva versión del archivo para ver la variación.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="w-64 rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-950"
        />
        <span className="text-xs text-slate-500">
          {filasFiltradas.length} de {filas.length}
        </span>
      </div>
      {filasFiltradas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          Ningún producto coincide con la búsqueda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2 text-right">Precio anterior</th>
                <th className="px-3 py-2 text-right">Precio nuevo</th>
                <th className="px-3 py-2 text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <FilaDeltaLista key={f.codigoProveedor} f={f} umbralAlerta={umbralAlerta} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaDeltaLista({ f, umbralAlerta }: { f: FilaDeltaListaProveedor; umbralAlerta: number }) {
  const esAlerta = f.porcentajeVariacion >= umbralAlerta;
  const subioAlgo = f.porcentajeVariacion > 0;
  const bajoAlgo = f.porcentajeVariacion < 0;

  return (
    <tr className={`border-t border-slate-100 ${esAlerta ? "bg-rose-50" : ""}`}>
      <td className="px-3 py-2 font-medium text-slate-900">{f.descripcion}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{f.categoria ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-500">{formatoMoneda(f.precioAnterior)}</div>
        <div className="text-xs text-slate-400" title={`Cargado el ${formatoFechaHora(f.fechaAnterior)}`}>
          {f.archivoAnterior}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.precioNuevo)}</div>
        <div className="text-xs text-slate-400" title={`Cargado el ${formatoFechaHora(f.fechaNueva)}`}>
          {f.archivoNuevo}
        </div>
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
          subioAlgo ? "text-rose-600" : bajoAlgo ? "text-emerald-600" : "text-slate-400"
        }`}
      >
        {f.porcentajeVariacion > 0 ? "+" : ""}
        {f.porcentajeVariacion}%
      </td>
    </tr>
  );
}
