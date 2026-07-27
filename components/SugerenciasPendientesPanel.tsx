"use client";

import { confirmarSugerencia, eliminarParPrecio } from "@/app/control-precios/comparacion/actions";
import type { FilaSugerenciaPar } from "@/lib/control-precios/consultas";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { useMemo, useState, useTransition } from "react";

export function SugerenciasPendientesPanel({ filas }: { filas: FilaSugerenciaPar[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [resueltos, setResueltos] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const termino = busqueda.trim().toLowerCase();
  const filasVisibles = useMemo(() => {
    let f = filas.filter((x) => !resueltos.has(x.parId));
    if (termino) {
      f = f.filter(
        (x) => x.nombreCriollo.toLowerCase().includes(termino) || x.nombreEmporio.toLowerCase().includes(termino)
      );
    }
    return f;
  }, [filas, termino, resueltos]);

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        No hay sugerencias pendientes por revisar.
      </div>
    );
  }

  function confirmar(parId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await confirmarSugerencia(parId);
        setResueltos((prev) => new Set(prev).add(parId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al confirmar.");
      }
    });
  }

  function descartar(parId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await eliminarParPrecio(parId);
        setResueltos((prev) => new Set(prev).add(parId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al descartar.");
      }
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
          className="w-64 rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-950"
        />
        <span className="text-xs text-slate-500">
          {filasVisibles.length} de {filas.length} sin resolver
        </span>
      </div>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {filasVisibles.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          {termino ? "Ninguna sugerencia coincide con la búsqueda." : "Ya revisaste todas las sugerencias — ¡listo!"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Producto (El Criollo)</th>
                <th className="px-3 py-2">Producto (El Emporio)</th>
                <th className="px-3 py-2 text-right">Precio Criollo</th>
                <th className="px-3 py-2 text-right">Precio Emporio</th>
                <th className="px-3 py-2">Por qué está en duda</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((f) => (
                <FilaSugerencia key={f.parId} f={f} pending={pending} onConfirmar={confirmar} onDescartar={descartar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaSugerencia({
  f,
  pending,
  onConfirmar,
  onDescartar,
}: {
  f: FilaSugerenciaPar;
  pending: boolean;
  onConfirmar: (parId: number) => void;
  onDescartar: (parId: number) => void;
}) {
  return (
    <tr className="border-t border-amber-100 bg-amber-50/40">
      <td className="px-3 py-2 font-medium text-slate-900">{f.nombreCriollo}</td>
      <td className="px-3 py-2 text-slate-700">{f.nombreEmporio}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.precioCriollo)}</div>
        <div className="text-xs text-slate-400">
          {f.esEstimadoCriollo
            ? "estimado"
            : f.fechaCriollo
              ? `real ajustado, ${formatoFecha(f.fechaCriollo)}`
              : "real ajustado"}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.precioEmporio)}</div>
        <div className="text-xs text-slate-400">
          {f.esEstimadoEmporio ? "estimado" : f.fechaEmporio ? `real, ${formatoFecha(f.fechaEmporio)}` : "real"}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-amber-700">{f.motivo ?? "similitud parcial"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirmar(f.parId)}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Es el mismo
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDescartar(f.parId)}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            No es
          </button>
        </div>
      </td>
    </tr>
  );
}
