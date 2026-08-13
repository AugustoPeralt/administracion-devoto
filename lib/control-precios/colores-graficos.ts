import { CATEGORIAS_INSUMO } from "./constantes";

// Paleta categórica validada (colorblind-safe, orden fijo — nunca ciclada ni
// reasignada por ranking) para el único gráfico con identidad real por color:
// gasto por categoría de insumo. Cada categoría conserva siempre el mismo
// color sin importar el filtro aplicado.
const PALETA_CATEGORICA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;

export const COLOR_POR_CATEGORIA: Record<(typeof CATEGORIAS_INSUMO)[number], string> = Object.fromEntries(
  CATEGORIAS_INSUMO.map((categoria, i) => [categoria, PALETA_CATEGORICA[i]])
) as Record<(typeof CATEGORIAS_INSUMO)[number], string>;

// Gasto por proveedor y top de productos son rankings de magnitud sin
// identidad categórica entre barras (no hay "series" que distinguir) — un
// solo hue por gráfico, cada uno tomando el siguiente slot para diferenciarse
// visualmente del otro en la misma pantalla.
export const COLOR_GASTO_PROVEEDOR = "#2a78d6";
export const COLOR_GASTO_PRODUCTO = "#eb6834";
