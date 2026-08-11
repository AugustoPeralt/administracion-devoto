"use client";

import { corregirFechaFactura } from "@/app/control-precios/actions";
import { formatoMoneda } from "@/lib/formato";
import type { FacturaFechaSospechosa } from "@/lib/control-precios/consultas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FacturasFechaSospechosaPanel({ facturas }: { facturas: FacturaFechaSospechosa[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (facturas.length === 0) return null;

  async function guardar(facturaId: number) {
    const nuevaFecha = valores[facturaId];
    if (!nuevaFecha) return;
    setError(null);
    setGuardando(facturaId);
    try {
      await corregirFechaFactura(facturaId, nuevaFecha);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al corregir la fecha.");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">Facturas con año sospechoso ({facturas.length})</h2>
      <p className="mb-3 text-xs text-amber-700">
        El año no coincide con el actual — probablemente la IA leyó mal un dígito del ticket. Abrí la foto original
        para confirmar la fecha real antes de corregir.
      </p>
      <div className="space-y-2">
        {facturas.map((f) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-white p-2.5 text-sm"
          >
            <span className="font-medium text-slate-900">{f.proveedorNombre}</span>
            <span className="text-xs text-slate-500">{f.localNombre ?? "sin local"}</span>
            <span className="text-xs text-slate-400">{formatoMoneda(f.montoTotal)}</span>
            <a
              href={`/api/control-precios/ver-comprobante/${f.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              Ver foto
            </a>
            <Link href={`/control-precios/facturas/${f.id}`} className="text-xs text-slate-600 underline hover:text-slate-900">
              Corregir ítems
            </Link>
            <div className="flex-1" />
            <span className="text-xs text-slate-400 line-through">{f.fechaEmision.slice(0, 10)}</span>
            <input
              type="date"
              value={valores[f.id] ?? ""}
              onChange={(e) => setValores((prev) => ({ ...prev, [f.id]: e.target.value }))}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
            />
            <button
              type="button"
              disabled={!valores[f.id] || guardando === f.id}
              onClick={() => void guardar(f.id)}
              className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando === f.id ? "Guardando..." : "Corregir"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
