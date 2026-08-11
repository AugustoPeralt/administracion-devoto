"use client";

import { corregirMontoFactura, justificarFacturasPosibleDuplicado } from "@/app/control-precios/actions";
import { formatoMoneda, parseNumeroDecimal } from "@/lib/formato";
import type { GrupoFacturaPosibleDuplicado } from "@/lib/control-precios/consultas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function claveGrupo(g: GrupoFacturaPosibleDuplicado): string {
  return g.facturaIds.join(",");
}

/** Colorea la pista de confianza: alto overlap de ítems = probable copia subida
 * dos veces (rojo); bajo overlap = probable página distinta de un mismo
 * comprobante multipágina (ámbar, no es necesariamente un error). */
function badgeOverlap(pct: number): string {
  if (pct >= 70) return "bg-rose-100 text-rose-800";
  if (pct <= 15) return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

export function FacturasNumeroRepetidoPanel({ grupos }: { grupos: GrupoFacturaPosibleDuplicado[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<number, string>>({});
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (grupos.length === 0) return null;

  async function corregir(facturaId: number) {
    const monto = parseNumeroDecimal(valores[facturaId]);
    if (!Number.isFinite(monto) || monto < 0) return;
    setError(null);
    setProcesando(`f${facturaId}`);
    try {
      await corregirMontoFactura(facturaId, monto);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al corregir el monto.");
    } finally {
      setProcesando(null);
    }
  }

  async function justificar(g: GrupoFacturaPosibleDuplicado) {
    const clave = claveGrupo(g);
    const comentario = comentarios[clave] ?? "";
    if (!comentario.trim()) return;
    setError(null);
    setProcesando(clave);
    try {
      await justificarFacturasPosibleDuplicado(g.facturaIds, g.proveedorId, comentario);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al justificar el caso.");
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">
        Facturas posiblemente cargadas dos veces ({grupos.length})
      </h2>
      <p className="mb-3 text-xs text-amber-700">
        Dos señales distintas: mismo número de comprobante (puede ser una factura de varias páginas — solo la
        página con el TOTAL real debe quedar con monto {'>'} 0), o mismo proveedor+local+fecha+monto exacto (fuerte
        indicio de la misma foto subida dos veces). El % de ítems en común es una pista, no la decisión: cerca de
        100% suele ser copia repetida, cerca de 0% suele ser una página distinta de un mismo comprobante. Abrí las
        fotos antes de corregir.
      </p>
      <div className="space-y-3">
        {grupos.map((g) => {
          const clave = claveGrupo(g);
          return (
            <div key={clave} className="rounded-md border border-amber-200 bg-white p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{g.proveedorNombre}</span>
                <span className="text-xs text-slate-500">{g.localNombre ?? "sin local"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeOverlap(g.itemsComunesMaximo)}`}>
                  {g.itemsComunesMaximo}% de ítems en común
                </span>
              </div>
              <div className="space-y-1.5">
                {g.facturas.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                    <span className="text-xs text-slate-500">{f.fechaEmision.slice(0, 10)}</span>
                    <span className="text-xs text-slate-400">{f.numeroFactura ?? "sin número"}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-700">
                      {formatoMoneda(f.montoTotal)}
                    </span>
                    <a
                      href={`/api/control-precios/ver-comprobante/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-600 underline hover:text-slate-900"
                    >
                      Ver foto
                    </a>
                    <Link
                      href={`/control-precios/facturas/${f.id}`}
                      className="text-xs text-slate-600 underline hover:text-slate-900"
                    >
                      Corregir ítems
                    </Link>
                    <div className="flex-1" />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Monto correcto"
                      value={valores[f.id] ?? ""}
                      onChange={(e) => setValores((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
                    />
                    <button
                      type="button"
                      disabled={!valores[f.id] || procesando === `f${f.id}`}
                      onClick={() => void corregir(f.id)}
                      className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Corregir
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <input
                  type="text"
                  placeholder="Por qué está bien así (obligatorio)"
                  value={comentarios[clave] ?? ""}
                  onChange={(e) => setComentarios((prev) => ({ ...prev, [clave]: e.target.value }))}
                  className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
                />
                <button
                  type="button"
                  disabled={!comentarios[clave]?.trim() || procesando === clave}
                  onClick={() => void justificar(g)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  No es un problema, justificar
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
