"use client";

import type { PieSectorShapeProps, TooltipContentProps } from "recharts";
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { formatoMoneda } from "@/lib/formato";
import { COLOR_POR_CATEGORIA } from "@/lib/control-precios/colores-graficos";
import type { CategoriaInsumo } from "@/app/control-precios/actions";

const DIAMETRO = 220;

function TooltipDonut({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0];
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{String(punto.name)}</p>
      <p className="mt-0.5 text-slate-600">{formatoMoneda(Number(punto.value))}</p>
    </div>
  );
}

/** Gasto por categoría — donut con la paleta categórica fija (mismo color por
 * categoría en toda la app) y una leyenda al lado con el detalle en pesos y %,
 * ya que con solo el color no alcanza para identificar cada porción. */
export function GraficoGastoPorCategoria({ datos }: { datos: { categoria: CategoriaInsumo; total: number }[] }) {
  if (datos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-slate-400">Sin gasto registrado en este período.</p>;
  }

  const total = datos.reduce((acc, d) => acc + d.total, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="relative shrink-0" style={{ width: DIAMETRO, height: DIAMETRO }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos}
              dataKey="total"
              nameKey="categoria"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              shape={(props: PieSectorShapeProps) => {
                const categoria = (props.payload as { categoria: CategoriaInsumo }).categoria;
                return <Sector {...props} fill={COLOR_POR_CATEGORIA[categoria]} />;
              }}
            />
            <Tooltip content={TooltipDonut} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500">Total</span>
          <span className="text-base font-semibold text-slate-950">{formatoMoneda(total)}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {datos.map((d) => {
          const porcentaje = total > 0 ? (d.total / total) * 100 : 0;
          return (
            <li key={d.categoria} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLOR_POR_CATEGORIA[d.categoria] }}
              />
              <span className="w-24 shrink-0 text-slate-700">{d.categoria}</span>
              <span className="font-medium text-slate-900">{formatoMoneda(d.total)}</span>
              <span className="text-xs text-slate-400">{porcentaje.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
