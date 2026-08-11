"use client";

import { asignarPrecioManual } from "@/app/control-precios/actions";
import { parseNumeroDecimal } from "@/lib/formato";
import type { ItemPendienteDePrecio } from "@/lib/control-precios/consultas";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ItemsPendientesDePrecioPanel({ items }: { items: ItemPendienteDePrecio[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function guardar(detalleId: number) {
    const precio = parseNumeroDecimal(valores[detalleId]);
    if (!Number.isFinite(precio) || precio <= 0) return;
    setError(null);
    setGuardando(detalleId);
    try {
      await asignarPrecioManual(detalleId, precio);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el precio.");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">Ítems sin precio ({items.length})</h2>
      <p className="mb-3 text-xs text-amber-700">
        Quedaron sin precio al confirmar (típico de un remito de VERDULERIA que no trae precio impreso). La
        factura completa queda &quot;pendiente de revisión&quot; hasta asignarles un precio.
      </p>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.detalleId}
            className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-white p-2.5 text-sm"
          >
            <span className="font-medium text-slate-900">{it.productoNombre}</span>
            <span className="text-xs text-slate-500">
              {it.cantidad} {it.unidadMedida}
            </span>
            <span className="text-xs text-slate-400">{it.proveedorNombre}</span>
            <span className="text-xs text-slate-400">{it.localNombre ?? "sin local"}</span>
            <span className="text-xs text-slate-400">{it.fechaEmision.slice(0, 10)}</span>
            <a
              href={`/api/control-precios/ver-comprobante/${it.facturaId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              Ver factura
            </a>
            <div className="flex-1" />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Precio unitario"
              value={valores[it.detalleId] ?? ""}
              onChange={(e) => setValores((prev) => ({ ...prev, [it.detalleId]: e.target.value }))}
              className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
            />
            <button
              type="button"
              disabled={!valores[it.detalleId] || guardando === it.detalleId}
              onClick={() => void guardar(it.detalleId)}
              className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando === it.detalleId ? "Guardando..." : "Asignar"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
