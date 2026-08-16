"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Botón "Ver factura" que abre el comprobante en un panel lateral (slide-over)
 * en vez de una pestaña nueva, para no romper el flujo de revisión. Apunta al
 * mismo proxy autenticado de siempre (`/api/control-precios/ver-comprobante/[id]`,
 * ver app/api/control-precios/ver-comprobante/[facturaId]/route.ts) — mismo
 * archivo, mismo auth, el navegador lo renderiza igual (imagen o PDF) dentro
 * del iframe. Portal a document.body para no quedar recortado por el
 * overflow-x-auto de las tablas que lo usan. */
export function VisorFacturaDrawer({ facturaId, label = "Ver factura" }: { facturaId: number; label?: string }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    function alPresionarEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", alPresionarEscape);
    return () => document.removeEventListener("keydown", alPresionarEscape);
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-slate-500 underline hover:text-slate-900"
      >
        {label}
      </button>
      {abierto &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-950/40" onClick={() => setAbierto(false)} />
            <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Comprobante #{facturaId}</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <iframe
                src={`/api/control-precios/ver-comprobante/${facturaId}`}
                title={`Comprobante #${facturaId}`}
                className="flex-1 bg-slate-50"
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
