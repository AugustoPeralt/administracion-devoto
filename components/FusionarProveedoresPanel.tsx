"use client";

import { corregirCuitProveedor, descartarProveedoresDuplicados, fusionarProveedores } from "@/app/control-precios/actions";
import { formatoMoneda } from "@/lib/formato";
import type { ProveedorConTotales } from "@/lib/control-precios/consultas";
import { useRouter } from "next/navigation";
import { useState } from "react";

function claveGrupo(grupo: ProveedorConTotales[]): string {
  return grupo
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(",");
}

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
  const [cuitValores, setCuitValores] = useState<Record<number, string>>({});
  const [guardandoCuit, setGuardandoCuit] = useState<number | null>(null);
  const [comentariosDescartar, setComentariosDescartar] = useState<Record<string, string>>({});
  const [descartando, setDescartando] = useState<string | null>(null);
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

  async function guardarCuit(proveedorId: number, cuitActual: string | null) {
    const nuevo = cuitValores[proveedorId] ?? cuitActual ?? "";
    setError(null);
    setMensaje(null);
    setGuardandoCuit(proveedorId);
    try {
      await corregirCuitProveedor(proveedorId, nuevo.trim() || null);
      setMensaje("CUIT corregido.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al corregir el CUIT.");
    } finally {
      setGuardandoCuit(null);
    }
  }

  async function descartar(grupo: ProveedorConTotales[]) {
    const clave = claveGrupo(grupo);
    const comentario = comentariosDescartar[clave] ?? "";
    if (!comentario.trim()) return;
    setError(null);
    setMensaje(null);
    setDescartando(clave);
    try {
      await descartarProveedoresDuplicados(
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
    <div className="space-y-4">
      {gruposSugeridos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-900">
            Posibles duplicados detectados ({gruposSugeridos.length})
          </h2>
          <div className="space-y-3">
            {gruposSugeridos.map((grupo) => {
              const clave = claveGrupo(grupo);
              return (
                <div key={clave} className="space-y-1.5 rounded-md border border-amber-200 bg-white p-3">
                  {grupo.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">{p.nombre}</span>
                      <input
                        type="text"
                        placeholder="CUIT"
                        value={cuitValores[p.id] ?? p.cuit ?? ""}
                        onChange={(e) => setCuitValores((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
                      />
                      <button
                        type="button"
                        disabled={guardandoCuit === p.id || (cuitValores[p.id] ?? p.cuit ?? "") === (p.cuit ?? "")}
                        onClick={() => void guardarCuit(p.id, p.cuit)}
                        title="Corregir el CUIT de este proveedor (ej. si se cargó mal y por eso lo agrupó acá)"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {guardandoCuit === p.id ? "Guardando..." : "Guardar CUIT"}
                      </button>
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
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    <input
                      type="text"
                      placeholder="Por qué no son duplicados (obligatorio)"
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
                      No son duplicados, descartar
                    </button>
                  </div>
                </div>
              );
            })}
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
