"use client";

import { fusionarProveedores } from "@/app/control-precios/actions";
import { formatoMoneda } from "@/lib/formato";
import type { ProveedorConTotales } from "@/lib/control-precios/consultas";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FusionarProveedoresPanel({
  proveedores,
  gruposSugeridos,
}: {
  proveedores: ProveedorConTotales[];
  gruposSugeridos: ProveedorConTotales[][];
}) {
  const router = useRouter();
  const [fusionando, setFusionando] = useState<number | null>(null); // id del duplicado en curso
  const [canonicoManual, setCanonicoManual] = useState<string>("");
  const [duplicadoManual, setDuplicadoManual] = useState<string>("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fusionar(canonicoId: number, duplicadoId: number, nombreDuplicado: string) {
    setError(null);
    setMensaje(null);
    setFusionando(duplicadoId);
    try {
      await fusionarProveedores(canonicoId, duplicadoId);
      setMensaje(`"${nombreDuplicado}" se fusionó correctamente.`);
      setCanonicoManual("");
      setDuplicadoManual("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fusionar.");
    } finally {
      setFusionando(null);
    }
  }

  return (
    <div className="space-y-4">
      {gruposSugeridos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-900">
            Posibles duplicados detectados ({gruposSugeridos.length})
          </h2>
          <div className="space-y-3">
            {gruposSugeridos.map((grupo) => (
              <div key={grupo.map((p) => p.id).join("-")} className="space-y-1.5 rounded-md border border-amber-200 bg-white p-3">
                {grupo.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{p.nombre}</span>
                    <span className="text-xs text-slate-400">{p.cuit ?? "sin CUIT"}</span>
                    <span className="text-xs text-slate-500">
                      {p.facturas} factura{p.facturas === 1 ? "" : "s"} · {formatoMoneda(p.total)}
                    </span>
                    <div className="flex-1" />
                    {grupo
                      .filter((otro) => otro.id !== p.id)
                      .map((otro) => (
                        <button
                          key={otro.id}
                          type="button"
                          disabled={fusionando === p.id}
                          onClick={() => void fusionar(otro.id, p.id, p.nombre)}
                          title={`Mover todo lo de "${p.nombre}" a "${otro.nombre}" y borrar "${p.nombre}"`}
                          className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {fusionando === p.id ? "Fusionando..." : `Fusionar en "${otro.nombre}"`}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Fusionar manualmente</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Proveedor duplicado (se borra)</label>
            <select
              value={duplicadoManual}
              onChange={(e) => setDuplicadoManual(e.target.value)}
              className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            >
              <option value="">Elegí...</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.facturas} facturas)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Se fusiona en (queda este)</label>
            <select
              value={canonicoManual}
              onChange={(e) => setCanonicoManual(e.target.value)}
              className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            >
              <option value="">Elegí...</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.facturas} facturas)
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!canonicoManual || !duplicadoManual || fusionando !== null}
            onClick={() => {
              const duplicado = proveedores.find((p) => String(p.id) === duplicadoManual);
              if (duplicado) void fusionar(Number(canonicoManual), Number(duplicadoManual), duplicado.nombre);
            }}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fusionar
          </button>
        </div>
      </div>

      {mensaje && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</div>
      )}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </div>
  );
}
