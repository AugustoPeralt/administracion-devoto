"use client";

import { descartarProductosDuplicados, fusionarProductos } from "@/app/control-precios/actions";
import type { ProductoConTotales } from "@/lib/control-precios/consultas";
import { useRouter } from "next/navigation";
import { useState } from "react";

function claveGrupo(grupo: ProductoConTotales[]): string {
  return grupo
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(",");
}

export function FusionarProductosPanel({ gruposSugeridos }: { gruposSugeridos: ProductoConTotales[][] }) {
  const router = useRouter();
  const [fusionando, setFusionando] = useState<number | null>(null);
  const [comentariosDescartar, setComentariosDescartar] = useState<Record<string, string>>({});
  const [descartando, setDescartando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (gruposSugeridos.length === 0) return null;

  async function fusionar(canonicoId: number, duplicadoId: number, nombreDuplicado: string) {
    setError(null);
    setMensaje(null);
    setFusionando(duplicadoId);
    try {
      await fusionarProductos(canonicoId, duplicadoId);
      setMensaje(`"${nombreDuplicado}" se fusionó correctamente.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fusionar.");
    } finally {
      setFusionando(null);
    }
  }

  async function descartar(grupo: ProductoConTotales[]) {
    const clave = claveGrupo(grupo);
    const comentario = comentariosDescartar[clave] ?? "";
    if (!comentario.trim()) return;
    setError(null);
    setMensaje(null);
    setDescartando(clave);
    try {
      await descartarProductosDuplicados(
        grupo.map((p) => p.id),
        comentario
      );
      setMensaje("Sugerencia descartada — no van a volver a aparecer juntos como posible duplicado.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descartar.");
    } finally {
      setDescartando(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-amber-900">
          Posibles productos duplicados ({gruposSugeridos.length})
        </h2>
        <div className="space-y-3">
          {gruposSugeridos.map((grupo) => {
            const clave = claveGrupo(grupo);
            return (
              <div key={clave} className="space-y-1.5 rounded-md border border-amber-200 bg-white p-3">
                <p className="text-xs text-slate-400">{grupo[0].proveedorNombre}</p>
                {grupo.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{p.nombre}</span>
                    <span className="text-xs text-slate-500">
                      {p.facturas} factura{p.facturas === 1 ? "" : "s"}
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
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                  <input
                    type="text"
                    placeholder="Por qué no son el mismo producto (obligatorio)"
                    value={comentariosDescartar[clave] ?? ""}
                    onChange={(e) => setComentariosDescartar((prev) => ({ ...prev, [clave]: e.target.value }))}
                    className="min-w-50 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
                  />
                  <button
                    type="button"
                    disabled={!comentariosDescartar[clave]?.trim() || descartando === clave}
                    onClick={() => void descartar(grupo)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    No son el mismo producto, descartar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {mensaje && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</div>
      )}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </div>
  );
}
