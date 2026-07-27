"use client";

import { crearParPrecio, eliminarParPrecio } from "@/app/control-precios/comparacion/actions";
import type { FilaListaParaEmparejar } from "@/lib/control-precios/consultas";
import { formatoMoneda } from "@/lib/formato";
import { useMemo, useState, useTransition } from "react";

function filtrarPorTexto(filas: FilaListaParaEmparejar[], termino: string): FilaListaParaEmparejar[] {
  const t = termino.trim().toLowerCase();
  if (!t) return filas;
  return filas.filter((f) => f.descripcion.toLowerCase().includes(t));
}

export function EmparejarPreciosPanel({
  criollo,
  emporio,
}: {
  criollo: FilaListaParaEmparejar[];
  emporio: FilaListaParaEmparejar[];
}) {
  const [seleccionCriollo, setSeleccionCriollo] = useState<number | null>(null);
  const [seleccionEmporio, setSeleccionEmporio] = useState<number | null>(null);
  const [busquedaCriollo, setBusquedaCriollo] = useState("");
  const [busquedaEmporio, setBusquedaEmporio] = useState("");
  const [categoriaCriollo, setCategoriaCriollo] = useState("");
  const [ocultarEmparejados, setOcultarEmparejados] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nombrePorId = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const f of [...criollo, ...emporio]) mapa.set(f.id, f.descripcion);
    return mapa;
  }, [criollo, emporio]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const f of criollo) if (f.categoria) set.add(f.categoria);
    return [...set].sort();
  }, [criollo]);

  const criolloFiltrado = useMemo(() => {
    let filas = criollo;
    if (categoriaCriollo) filas = filas.filter((f) => f.categoria === categoriaCriollo);
    if (ocultarEmparejados) filas = filas.filter((f) => f.parLadoId === null);
    return filtrarPorTexto(filas, busquedaCriollo);
  }, [criollo, busquedaCriollo, categoriaCriollo, ocultarEmparejados]);

  const emporioFiltrado = useMemo(() => {
    let filas = emporio;
    if (ocultarEmparejados) filas = filas.filter((f) => f.parLadoId === null);
    return filtrarPorTexto(filas, busquedaEmporio);
  }, [emporio, busquedaEmporio, ocultarEmparejados]);

  const emparejadosCriollo = criollo.filter((f) => f.parLadoId !== null).length;
  const emparejadosEmporio = emporio.filter((f) => f.parLadoId !== null).length;

  function confirmarPar(listaAId: number, listaBId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await crearParPrecio(listaAId, listaBId);
        setSeleccionCriollo(null);
        setSeleccionEmporio(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al emparejar.");
      }
    });
  }

  function quitarPar(parId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await eliminarParPrecio(parId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al desemparejar.");
      }
    });
  }

  function alClickearCriollo(fila: FilaListaParaEmparejar) {
    if (fila.parLadoId !== null || pending) return;
    if (seleccionEmporio !== null) confirmarPar(fila.id, seleccionEmporio);
    else setSeleccionCriollo((prev) => (prev === fila.id ? null : fila.id));
  }

  function alClickearEmporio(fila: FilaListaParaEmparejar) {
    if (fila.parLadoId !== null || pending) return;
    if (seleccionCriollo !== null) confirmarPar(seleccionCriollo, fila.id);
    else setSeleccionEmporio((prev) => (prev === fila.id ? null : fila.id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
        <span>
          Elegí un producto de un lado y después el que le corresponde del otro para confirmar el par. Emparejados:{" "}
          <strong className="text-slate-900">{emparejadosCriollo}</strong> de {criollo.length} (El Criollo),{" "}
          <strong className="text-slate-900">{emparejadosEmporio}</strong> de {emporio.length} (El Emporio).
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={ocultarEmparejados}
            onChange={(e) => setOcultarEmparejados(e.target.checked)}
            className="rounded border-slate-300"
          />
          Ocultar ya emparejados
        </label>
      </div>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">El Criollo</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={busquedaCriollo}
              onChange={(e) => setBusquedaCriollo(e.target.value)}
              placeholder="Buscar producto..."
              className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-950"
            />
            <select
              value={categoriaCriollo}
              onChange={(e) => setCategoriaCriollo(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-950"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <ListaEmparejable
            filas={criolloFiltrado}
            seleccionId={seleccionCriollo}
            nombrePorId={nombrePorId}
            onClick={alClickearCriollo}
            onQuitarPar={quitarPar}
            mostrarBonificado={false}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">El Emporio</p>
          <input
            type="text"
            value={busquedaEmporio}
            onChange={(e) => setBusquedaEmporio(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-950"
          />
          <ListaEmparejable
            filas={emporioFiltrado}
            seleccionId={seleccionEmporio}
            nombrePorId={nombrePorId}
            onClick={alClickearEmporio}
            onQuitarPar={quitarPar}
            mostrarBonificado
          />
        </div>
      </div>
    </div>
  );
}

function ListaEmparejable({
  filas,
  seleccionId,
  nombrePorId,
  onClick,
  onQuitarPar,
  mostrarBonificado,
}: {
  filas: FilaListaParaEmparejar[];
  seleccionId: number | null;
  nombrePorId: Map<number, string>;
  onClick: (fila: FilaListaParaEmparejar) => void;
  onQuitarPar: (parId: number) => void;
  mostrarBonificado: boolean;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Ningún producto coincide con el filtro.
      </div>
    );
  }

  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      {filas.map((f) => {
        const emparejado = f.parLadoId !== null;
        const seleccionado = seleccionId === f.id;
        const precio = mostrarBonificado ? (f.precioConBonificacion ?? f.precioLista) : f.precioLista;
        return (
          <div
            key={f.id}
            onClick={() => onClick(f)}
            className={`flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm first:border-t-0 ${
              emparejado
                ? "bg-emerald-50"
                : seleccionado
                  ? "cursor-pointer bg-slate-950 text-white"
                  : "cursor-pointer hover:bg-slate-50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className={`truncate ${seleccionado ? "text-white" : "text-slate-900"}`}>{f.descripcion}</p>
              {emparejado && f.parLadoId !== null && (
                <p className="truncate text-xs text-emerald-700">↔ {nombrePorId.get(f.parLadoId) ?? "—"}</p>
              )}
            </div>
            <span className={`shrink-0 font-mono tabular-nums text-xs ${seleccionado ? "text-white" : "text-slate-500"}`}>
              {formatoMoneda(precio)}
            </span>
            {emparejado && f.parId !== null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuitarPar(f.parId!);
                }}
                className="shrink-0 text-xs text-rose-600 underline hover:text-rose-800"
              >
                Quitar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
