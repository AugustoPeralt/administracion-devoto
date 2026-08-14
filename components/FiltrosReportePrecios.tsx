"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIAS_INSUMO } from "@/lib/control-precios/constantes";

export function FiltrosReportePrecios({
  locales,
  proveedores,
}: {
  locales: { id: number; nombre: string }[];
  proveedores: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function actualizar(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    router.push(`${pathname}?${params.toString()}`);
  }

  function parseIds(param: string | null): number[] {
    return (param ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  const localIdsSeleccionados = parseIds(searchParams.get("local"));
  const proveedorIdsSeleccionados = parseIds(searchParams.get("proveedor"));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Desde</label>
        <input
          type="date"
          defaultValue={searchParams.get("desde") ?? ""}
          onChange={(e) => actualizar("desde", e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Hasta</label>
        <input
          type="date"
          defaultValue={searchParams.get("hasta") ?? ""}
          onChange={(e) => actualizar("hasta", e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Restaurantes</label>
        <SelectorMultiple
          opciones={locales}
          seleccionados={localIdsSeleccionados}
          onChange={(ids) => actualizar("local", ids.join(","))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Proveedores</label>
        <SelectorMultiple
          opciones={proveedores}
          seleccionados={proveedorIdsSeleccionados}
          onChange={(ids) => actualizar("proveedor", ids.join(","))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Categoría</label>
        <select
          defaultValue={searchParams.get("categoria") ?? ""}
          onChange={(e) => actualizar("categoria", e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
        >
          <option value="">Todas</option>
          {CATEGORIAS_INSUMO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Combo con checkboxes: permite elegir "todos" (nada tildado), una sola opción,
 * o cualquier subconjunto elegido a mano — a diferencia de un <select> nativo,
 * donde no es obvio para alguien no técnico que Ctrl/Cmd+click habilita
 * selección múltiple. Genérico: lo usan tanto Restaurantes como Proveedores. */
function SelectorMultiple({
  opciones,
  seleccionados,
  onChange,
}: {
  opciones: { id: number; nombre: string }[];
  seleccionados: number[];
  onChange: (ids: number[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClickearFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearFuera);
    return () => document.removeEventListener("mousedown", alClickearFuera);
  }, []);

  const etiqueta =
    seleccionados.length === 0
      ? "Todos"
      : seleccionados.length === 1
        ? (opciones.find((o) => o.id === seleccionados[0])?.nombre ?? "1 seleccionado")
        : `${seleccionados.length} seleccionados`;

  function alternar(id: number) {
    if (seleccionados.includes(id)) onChange(seleccionados.filter((s) => s !== id));
    else onChange([...seleccionados, id]);
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-56 items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-slate-300 focus:border-slate-950"
      >
        <span className="text-slate-900">{etiqueta}</span>
        <span className="text-slate-400">{abierto ? "▴" : "▾"}</span>
      </button>

      {abierto && (
        <div className="absolute z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
              seleccionados.length === 0 ? "font-semibold text-slate-950" : "text-slate-600"
            }`}
          >
            Todos
            {seleccionados.length === 0 && <span>✓</span>}
          </button>
          <div className="max-h-56 overflow-y-auto border-t border-slate-100 pt-1">
            {opciones.map((o) => {
              const marcado = seleccionados.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(o.id)}
                    className="rounded border-slate-300"
                  />
                  {o.nombre}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
