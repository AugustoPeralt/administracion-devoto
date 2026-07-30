"use client";

import type { FilaComparacionProveedores } from "@/lib/control-precios/consultas";
import { DESCUENTO_LISTA_EL_CRIOLLO } from "@/lib/control-precios/constantes";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { useMemo, useState } from "react";

type FiltroTipo = "todos" | "real_vs_estimado" | "ambos_reales" | "ambos_estimados";

const OPCIONES_FILTRO: { valor: FiltroTipo; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "real_vs_estimado", etiqueta: "Comprado a uno solo de los dos" },
  { valor: "ambos_reales", etiqueta: "Comprado a los dos" },
  { valor: "ambos_estimados", etiqueta: "No comprado a ninguno todavía" },
];

function coincideFiltro(f: FilaComparacionProveedores, filtro: FiltroTipo): boolean {
  if (filtro === "todos") return true;
  if (filtro === "ambos_reales") return !f.esEstimadoCriollo && !f.esEstimadoEmporio;
  if (filtro === "ambos_estimados") return f.esEstimadoCriollo && f.esEstimadoEmporio;
  // real_vs_estimado: uno real y el otro estimado (en cualquiera de los dos sentidos)
  return f.esEstimadoCriollo !== f.esEstimadoEmporio;
}

export function TablaComparacionProveedores({ filas }: { filas: FilaComparacionProveedores[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");

  const termino = busqueda.trim().toLowerCase();
  const filasFiltradas = useMemo(() => {
    return filas
      .filter((f) => coincideFiltro(f, filtro))
      .filter(
        (f) =>
          !termino ||
          f.nombreCriollo.toLowerCase().includes(termino) ||
          f.nombreEmporio.toLowerCase().includes(termino)
      );
  }, [filas, filtro, termino]);

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Todavía no hay pares confirmados — emparejá productos en la pantalla de arriba para verlos comparados acá.
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
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as FiltroTipo)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-950"
        >
          {OPCIONES_FILTRO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {filasFiltradas.length} de {filas.length}
        </span>
      </div>
      {filasFiltradas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          Ningún par coincide con este filtro.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Producto (El Criollo)</th>
                <th className="px-3 py-2">Producto (El Emporio)</th>
                <th className="px-3 py-2 text-right">Precio Criollo</th>
                <th className="px-3 py-2 text-right">Precio Emporio</th>
                <th className="px-3 py-2 text-right">Conviene</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <FilaComparacion key={f.parId} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaComparacion({ f }: { f: FilaComparacionProveedores }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-900">{f.nombreCriollo}</td>
      <td className="px-3 py-2 text-slate-700">{f.nombreEmporio}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.precioCriollo)}</div>
        <div className="text-xs text-slate-400">
          lista vigente (−{DESCUENTO_LISTA_EL_CRIOLLO}%)
          {f.esEstimadoCriollo ? ", nunca comprado" : f.fechaCriollo ? `, compra real ${formatoFecha(f.fechaCriollo)}` : ", ya comprado"}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-slate-900">{formatoMoneda(f.precioEmporio)}</div>
        <div className="text-xs text-slate-400">
          lista vigente
          {f.esEstimadoEmporio ? ", nunca comprado" : f.fechaEmporio ? `, compra real ${formatoFecha(f.fechaEmporio)}` : ", ya comprado"}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {f.masBarato === "igual" ? (
          <span className="text-slate-400">igual</span>
        ) : (
          <span
            className={`font-semibold ${f.masBarato === "criollo" ? "text-emerald-600" : "text-sky-600"}`}
          >
            {f.masBarato === "criollo" ? "Criollo" : "Emporio"} −{f.porcentajeDiferencia}%
          </span>
        )}
      </td>
    </tr>
  );
}
