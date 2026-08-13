"use client";

import type { BarShapeProps } from "recharts";
import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoMoneda } from "@/lib/formato";
import { COLOR_POR_CATEGORIA } from "@/lib/control-precios/colores-graficos";
import type { CategoriaInsumo } from "@/app/control-precios/actions";
import { GraficoTooltip } from "./GraficoTooltip";

const ALTO_POR_BARRA = 38;
const ALTO_MINIMO = 140;

/** Gasto por categoría — a diferencia de proveedor/producto, acá sí hay
 * identidad real por color (categorías fijas, mismo color en toda la app) por
 * eso usa la paleta categórica en vez de un hue único. */
export function GraficoGastoPorCategoria({ datos }: { datos: { categoria: CategoriaInsumo; total: number }[] }) {
  if (datos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-slate-400">Sin gasto registrado en este período.</p>;
  }

  const alto = Math.max(ALTO_MINIMO, datos.length * ALTO_POR_BARRA + 24);

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="#e1e0d9" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatoMoneda(v)}
          tick={{ fill: "#898781", fontSize: 11 }}
          axisLine={{ stroke: "#c3c2b7" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="categoria"
          width={110}
          tick={{ fill: "#52514e", fontSize: 12 }}
          axisLine={{ stroke: "#c3c2b7" }}
          tickLine={false}
        />
        <Tooltip content={GraficoTooltip} cursor={{ fill: "#f9f9f7" }} />
        <Bar
          dataKey="total"
          radius={[0, 4, 4, 0]}
          barSize={22}
          shape={(props: BarShapeProps) => {
            const categoria = (props.payload as { categoria: CategoriaInsumo }).categoria;
            return <Rectangle {...props} fill={COLOR_POR_CATEGORIA[categoria]} />;
          }}
        >
          <LabelList dataKey="total" position="right" formatter={(v) => formatoMoneda(Number(v))} style={{ fill: "#52514e", fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
