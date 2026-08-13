"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoMoneda, truncarTexto } from "@/lib/formato";
import { COLOR_GASTO_PROVEEDOR } from "@/lib/control-precios/colores-graficos";
import { GraficoTooltip } from "./GraficoTooltip";

const ALTO_POR_BARRA = 34;
const ALTO_MINIMO = 140;

/** Ranking de gasto verificado por proveedor — barras horizontales, un solo
 * hue (es un orden de magnitud, no una comparación de series con identidad
 * propia; el nombre en el eje ya identifica cada barra). */
export function GraficoGastoPorProveedor({ datos }: { datos: { proveedorNombre: string; gasto: number }[] }) {
  if (datos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-slate-400">Sin compras verificadas en este período.</p>;
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
          dataKey="proveedorNombre"
          width={170}
          tickFormatter={(v: string) => truncarTexto(v, 25)}
          tick={{ fill: "#52514e", fontSize: 12 }}
          axisLine={{ stroke: "#c3c2b7" }}
          tickLine={false}
        />
        <Tooltip content={GraficoTooltip} cursor={{ fill: "#f9f9f7" }} />
        <Bar dataKey="gasto" fill={COLOR_GASTO_PROVEEDOR} radius={[0, 4, 4, 0]} barSize={20}>
          <LabelList
            dataKey="gasto"
            position="right"
            formatter={(v) => formatoMoneda(Number(v))}
            style={{ fill: "#52514e", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
