"use client";

import type { TooltipContentProps } from "recharts";
import { formatoMoneda } from "@/lib/formato";

/** Tooltip compartido por los gráficos de barras de gasto — mismo estilo de
 * card (border-slate-200, shadow-sm) que el resto de la UI. Generics por
 * default (no <number, string>): Recharts infiere el tipo de `content` desde
 * el contexto del gráfico, y fijarlo más angosto que ese default rompe la
 * inferencia (contravarianza en la posición de parámetro de función). */
export function GraficoTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="mt-0.5 text-slate-600">{formatoMoneda(Number(payload[0].value))}</p>
    </div>
  );
}
