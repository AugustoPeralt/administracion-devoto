"use client";

import { descartarSustituto } from "@/app/control-precios/comparacion/sustitutos/actions";
import type { FilaSustituto } from "@/lib/control-precios/consultas";
import { formatoMoneda } from "@/lib/formato";
import { useState, useTransition } from "react";

export type FilaRecomendacionSustituto = {
  codigoProveedor: string;
  descripcion: string;
  proveedorNombre: string;
  porcentajeVariacion: number;
  precioNuevo: number;
  sustitutos: FilaSustituto[];
};

export function TablaRecomendacionesSustitutos({ filas }: { filas: FilaRecomendacionSustituto[] }) {
  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function descartar(sustitutoId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await descartarSustituto(sustitutoId);
        setOcultos((prev) => new Set(prev).add(sustitutoId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al descartar.");
      }
    });
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Ningún producto de El Criollo o El Emporio aumentó de precio en la última importación de lista.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto que aumentó</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Aumento</th>
              <th className="px-3 py-2 text-right">Precio actual</th>
              <th className="px-3 py-2">Sustituto más barato</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const visibles = f.sustitutos.filter((s) => !ocultos.has(s.sustitutoId));
              const masBarato = visibles.find((s) => s.porcentajeAhorro > 0);
              return (
                <tr key={f.codigoProveedor} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{f.descripcion}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{f.proveedorNombre}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-rose-600">
                    +{f.porcentajeVariacion}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                    {formatoMoneda(f.precioNuevo)}
                  </td>
                  <td className="px-3 py-2">
                    {masBarato ? (
                      <div>
                        <div className="font-medium text-emerald-700">{masBarato.descripcion}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono tabular-nums">{formatoMoneda(masBarato.precio)}</span> · ahorro{" "}
                          {masBarato.porcentajeAhorro}%
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Sin sustituto encontrado en el catálogo</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {masBarato && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => descartar(masBarato.sustitutoId)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        No sirve
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
