import { db } from "@/db";
import { alqLocales, cpProveedores } from "@/db/schema";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import type { CategoriaInsumo } from "@/app/control-precios/actions";
import { sonNombresSimilares } from "@/lib/control-precios/normalizar";
import {
  DESCUENTO_LISTA_EL_CRIOLLO,
  DIAS_MAX_DIFERENCIA_COMPARACION_RESTAURANTES,
  FACTOR_PRECIO_REAL_ADICIONAL,
  NOMBRE_PROVEEDOR_EL_CRIOLLO,
  PROVEEDORES_CON_AJUSTE_10_6,
  TOLERANCIA_SUBTOTAL,
} from "@/lib/control-precios/constantes";

export const NOMBRE_PROVEEDOR_EL_EMPORIO = "El Emporio de Lanús S.A.";

/** El Criollo y HORECA facturan con un descuento adicional (6% sobre el total
 * con IVA) que no aparece en ningún precio unitario — ver
 * FACTOR_PRECIO_REAL_ADICIONAL. El resto de los proveedores (FEMSA incluido)
 * son distribuidoras más directas sin ese mecanismo, así que su precio_unitario
 * ya es el precio real tal cual viene facturado, sin ajustar. */
export function precioRealAjustado(proveedorNombre: string, precioUnitario: number): number {
  return PROVEEDORES_CON_AJUSTE_10_6.includes(proveedorNombre) ? precioUnitario * FACTOR_PRECIO_REAL_ADICIONAL : precioUnitario;
}

/** Resuelve el id de un proveedor por su nombre exacto — usado para identificar
 * a El Criollo/El Emporio en la comparación de proveedores sin hardcodear un id
 * numérico que puede diferir entre entornos. */
export async function buscarProveedorIdPorNombre(nombre: string): Promise<number> {
  const [prov] = await db.select({ id: cpProveedores.id }).from(cpProveedores).where(eq(cpProveedores.nombre, nombre));
  if (!prov) throw new Error(`No se encontró el proveedor "${nombre}" en la base.`);
  return prov.id;
}

/** Mínima interfaz que necesitamos de un "db" para poder correr la misma consulta
 * dentro de una transacción de otro driver (ver scripts/probar-delta-precios.ts,
 * que arma una factura de prueba y hace ROLLBACK — necesita ejecutar esta misma
 * query pero contra esa transacción, no contra el `db` normal de la app). */
type Ejecutor = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

export async function obtenerLocales() {
  return db
    .select({ id: alqLocales.id, nombre: alqLocales.nombre })
    .from(alqLocales)
    .orderBy(alqLocales.nombre);
}

export type UltimaCargaLocal = {
  id: number;
  localNombre: string;
  ultimaFechaEmision: string | null;
  ultimaFechaCarga: string | null;
  totalFacturas: number;
};

/**
 * Para cada restaurante, la fecha de emisión de la última factura cargada (hasta
 * dónde hay datos) y cuándo se hizo esa carga (fecha_carga, que puede ser mucho
 * después si el papel se acumuló) — para saber de un vistazo desde qué fecha
 * retomar la subida de comprobantes en cada local. LEFT JOIN a propósito: un local
 * sin ninguna factura todavía tiene que aparecer igual (con fechas null), no
 * desaparecer de la lista. Ordenado con los más desactualizados primero (NULLS
 * FIRST: nunca cargado > hace mucho > al día).
 */
export async function obtenerUltimaCargaPorLocal(): Promise<{
  porLocal: UltimaCargaLocal[];
  sinAsignar: { total: number; ultimaFechaEmision: string | null };
}> {
  const [porLocal, sinAsignar] = await Promise.all([
    db.execute(sql`
      SELECT loc.id, loc.nombre AS "localNombre",
        MAX(f.fecha_emision) AS "ultimaFechaEmision", MAX(f.fecha_carga) AS "ultimaFechaCarga",
        COUNT(f.id)::int AS "totalFacturas"
      FROM alq_locales loc
      LEFT JOIN cp_facturas f ON f.local_id = loc.id
      GROUP BY loc.id, loc.nombre
      ORDER BY MAX(f.fecha_emision) ASC NULLS FIRST
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total, MAX(fecha_emision) AS "ultimaFechaEmision"
      FROM cp_facturas
      WHERE local_id IS NULL
    `),
  ]);
  return {
    porLocal: porLocal.rows as UltimaCargaLocal[],
    sinAsignar: sinAsignar.rows[0] as { total: number; ultimaFechaEmision: string | null },
  };
}

export async function obtenerProveedores() {
  return db
    .select({ id: cpProveedores.id, nombre: cpProveedores.nombre })
    .from(cpProveedores)
    .orderBy(asc(cpProveedores.nombre));
}

export type ProveedorConTotales = {
  id: number;
  nombre: string;
  categoria: CategoriaInsumo;
  cuit: string | null;
  facturas: number;
  total: number;
};

/** Proveedores con cantidad de facturas y gasto total — para la pantalla de
 * fusión, donde hace falta ver de un vistazo cuál conviene dejar como canónico. */
export async function obtenerProveedoresConTotales(): Promise<ProveedorConTotales[]> {
  const resultado = await db.execute(sql`
    SELECT prov.id, prov.nombre, prov.categoria, prov.cuit,
      COUNT(f.id)::int AS facturas, COALESCE(SUM(f.monto_total), 0) AS total
    FROM cp_proveedores prov
    LEFT JOIN cp_facturas f ON f.proveedor_id = prov.id
    GROUP BY prov.id, prov.nombre, prov.categoria, prov.cuit
    ORDER BY prov.nombre
  `);
  return (resultado.rows as { total: string; facturas: number; [k: string]: unknown }[]).map((r) => ({
    ...r,
    total: Number(r.total),
  })) as ProveedorConTotales[];
}

/** Agrupa elementos con nombre (proveedores o productos) que probablemente sean
 * el mismo — ver sonNombresSimilares(). Es una pista para el usuario, no fusiona
 * nada solo: la fusión siempre la confirma una persona. Sirve tanto para
 * proveedores como para productos (ver agruparPosiblesDuplicados y
 * agruparPosiblesProductosDuplicados). */
function agruparPorNombreSimilar<T extends { id: number; nombre: string }>(elementos: T[]): T[][] {
  const grupos: T[][] = [];
  const yaAgrupados = new Set<number>();

  for (let i = 0; i < elementos.length; i++) {
    if (yaAgrupados.has(elementos[i].id)) continue;

    const grupo = [elementos[i]];
    for (let j = i + 1; j < elementos.length; j++) {
      if (yaAgrupados.has(elementos[j].id)) continue;
      if (sonNombresSimilares(elementos[i].nombre, elementos[j].nombre)) {
        grupo.push(elementos[j]);
      }
    }

    if (grupo.length > 1) {
      grupo.forEach((p) => yaAgrupados.add(p.id));
      grupos.push(grupo);
    }
  }

  return grupos;
}

/** Agrupa proveedores que probablemente sean el mismo. Heurística para sugerir en
 * la UI — la decisión de fusionar la toma siempre la persona. */
export function agruparPosiblesDuplicados(
  proveedores: ProveedorConTotales[]
): ProveedorConTotales[][] {
  return agruparPorNombreSimilar(proveedores);
}

export type ProductoConTotales = {
  id: number;
  nombre: string;
  proveedorId: number;
  proveedorNombre: string;
  unidadMedida: string;
  facturas: number;
};

/** Productos con cantidad de facturas donde aparecen — para detectar duplicados
 * dentro de un mismo proveedor (ej. "Hielo x 15 kg." cargado dos veces con
 * variantes de nombre antes de que existiera el proveedor único). */
export async function obtenerProductosConTotales(): Promise<ProductoConTotales[]> {
  const resultado = await db.execute(sql`
    SELECT p.id, p.nombre, p.proveedor_id AS "proveedorId", prov.nombre AS "proveedorNombre",
      p.unidad_medida AS "unidadMedida", COUNT(DISTINCT df.factura_id)::int AS facturas
    FROM cp_productos p
    JOIN cp_proveedores prov ON prov.id = p.proveedor_id
    LEFT JOIN cp_detalle_facturas df ON df.producto_id = p.id
    GROUP BY p.id, p.nombre, p.proveedor_id, prov.nombre, p.unidad_medida
    ORDER BY prov.nombre, p.nombre
  `);
  return resultado.rows as ProductoConTotales[];
}

/** Agrupa productos posiblemente duplicados, pero solo dentro del mismo
 * proveedor — dos proveedores distintos pueden vender legítimamente "Hielo x 15
 * kg." cada uno con su propio producto, eso no es un duplicado. */
export function agruparPosiblesProductosDuplicados(
  productos: ProductoConTotales[]
): ProductoConTotales[][] {
  const porProveedor = new Map<number, ProductoConTotales[]>();
  for (const p of productos) {
    const lista = porProveedor.get(p.proveedorId) ?? [];
    lista.push(p);
    porProveedor.set(p.proveedorId, lista);
  }

  const grupos: ProductoConTotales[][] = [];
  for (const lista of porProveedor.values()) {
    grupos.push(...agruparPorNombreSimilar(lista));
  }
  return grupos;
}

export type FacturaFechaSospechosa = {
  id: number;
  fechaEmision: string;
  montoTotal: string;
  archivoUrl: string | null;
  proveedorNombre: string;
  localNombre: string | null;
};

/** Facturas cuyo año no coincide con el año actual, o que quedaron fechadas en el
 * futuro — la IA suele confundir un dígito del año o del día en fotos de mala
 * calidad (ej. "2024" en vez de "2026", o "22" en vez de "17"); una factura ya
 * recibida y fotografiada nunca puede tener fecha posterior a hoy. No se corrige
 * sola: se lista para que la persona revise la foto original y confirme. */
export async function obtenerFacturasConFechaSospechosa(): Promise<FacturaFechaSospechosa[]> {
  const resultado = await db.execute(sql`
    SELECT f.id, f.fecha_emision AS "fechaEmision", f.monto_total AS "montoTotal",
      f.archivo_url AS "archivoUrl", prov.nombre AS "proveedorNombre", loc.nombre AS "localNombre"
    FROM cp_facturas f
    JOIN cp_proveedores prov ON prov.id = f.proveedor_id
    LEFT JOIN alq_locales loc ON loc.id = f.local_id
    WHERE EXTRACT(YEAR FROM f.fecha_emision) != EXTRACT(YEAR FROM CURRENT_DATE)
      OR f.fecha_emision > CURRENT_DATE
    ORDER BY f.fecha_emision
  `);
  return resultado.rows as FacturaFechaSospechosa[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Quincena en curso según el día de hoy en hora Argentina: día 1-15 o 16-fin de
 * mes. Es el rango que precarga el reporte al entrar, editable desde los filtros. */
export function quincenaActual(): { desde: string; hasta: string } {
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth() + 1;
  const dia = ahora.getDate();

  if (dia <= 15) {
    return { desde: `${anio}-${pad(mes)}-01`, hasta: `${anio}-${pad(mes)}-15` };
  }
  const ultimoDiaDelMes = new Date(anio, mes, 0).getDate();
  return { desde: `${anio}-${pad(mes)}-16`, hasta: `${anio}-${pad(mes)}-${pad(ultimoDiaDelMes)}` };
}

export type FiltrosReporte = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  // Vacío o ausente = todos los restaurantes. Uno o varios ids = solo esos —
  // permite elegir "todos", "uno solo" o "un subconjunto elegido" desde la misma
  // pantalla, sin necesitar tres controles distintos.
  localIds?: number[];
  proveedorId?: number;
  categoria?: CategoriaInsumo;
};

/** Parsea el parámetro de URL "local" (ids separados por coma, ej. "7,8") al
 * array que espera FiltrosReporte.localIds. Ausente o vacío = undefined = todos
 * los restaurantes, mismo criterio que el resto de los filtros opcionales. */
export function parseLocalIds(param: string | null | undefined): number[] | undefined {
  if (!param) return undefined;
  const ids = param
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n));
  return ids.length > 0 ? ids : undefined;
}

/** Convierte una lista de ids a la sintaxis de array literal de Postgres
 * (ej. "{1,2,3}") para poder pasarla como UN solo parámetro con `= ANY(...)`. El
 * driver neon-http no soporta bindear un array de JS como parámetro nativo dentro
 * de `sql\`...\`` (lo desarma en tuplas sueltas) — ver diagnóstico previo a este
 * cambio. Null cuando la lista está vacía, para el patrón "sin filtro = todos"
 * que ya usan el resto de los filtros de este archivo. */
function literalArrayInt(ids: number[] | undefined): string | null {
  return ids && ids.length > 0 ? `{${ids.join(",")}}` : null;
}

export type FilaDeltaPrecio = {
  productoId: number;
  productoNombre: string;
  unidadMedida: string;
  proveedorId: number;
  proveedorNombre: string;
  categoria: CategoriaInsumo;
  localId: number | null;
  localNombre: string | null;
  precioBase: string | null;
  fechaBase: string | null;
  precioActual: string;
  fechaActual: string;
  porcentajeAumento: string | null;
};

/**
 * Delta de precio unitario por producto + local dentro de [desde, hasta].
 * `precio_base` prioriza el último precio ANTES del período (¿subió respecto a la
 * última vez que se compró?); si no hay historia previa, cae al primer precio
 * observado dentro del propio período (sirve para ver la tendencia intra-quincena
 * cuando es la primera vez que se registra ese producto). Partido por local además
 * de por producto porque el mismo proveedor puede cobrarle distinto a cada
 * restaurante — ver comentario en cp_facturas.local_id.
 */
export async function obtenerDeltaPrecios(
  filtros: FiltrosReporte,
  ejecutor: Ejecutor = db
): Promise<FilaDeltaPrecio[]> {
  const { desde, hasta, localIds, proveedorId = null, categoria = null } = filtros;
  const localIdsLit = literalArrayInt(localIds);

  const resultado = await ejecutor.execute(sql`
    WITH ultimo_antes AS (
      SELECT DISTINCT ON (df.producto_id, f.local_id)
        df.producto_id, f.local_id, df.precio_unitario AS precio, f.fecha_emision AS fecha
      FROM cp_detalle_facturas df
      JOIN cp_facturas f ON f.id = df.factura_id
      WHERE df.precio_unitario IS NOT NULL AND f.fecha_emision < ${desde}
      ORDER BY df.producto_id, f.local_id, f.fecha_emision DESC
    ),
    primero_periodo AS (
      SELECT DISTINCT ON (df.producto_id, f.local_id)
        df.producto_id, f.local_id, df.precio_unitario AS precio, f.fecha_emision AS fecha
      FROM cp_detalle_facturas df
      JOIN cp_facturas f ON f.id = df.factura_id
      WHERE df.precio_unitario IS NOT NULL AND f.fecha_emision BETWEEN ${desde} AND ${hasta}
      ORDER BY df.producto_id, f.local_id, f.fecha_emision ASC
    ),
    ultimo_periodo AS (
      SELECT DISTINCT ON (df.producto_id, f.local_id)
        df.producto_id, f.local_id, df.precio_unitario AS precio, f.fecha_emision AS fecha,
        p.nombre AS producto_nombre, p.unidad_medida,
        prov.id AS proveedor_id, prov.nombre AS proveedor_nombre, prov.categoria
      FROM cp_detalle_facturas df
      JOIN cp_facturas f ON f.id = df.factura_id
      JOIN cp_productos p ON p.id = df.producto_id
      JOIN cp_proveedores prov ON prov.id = p.proveedor_id
      WHERE df.precio_unitario IS NOT NULL AND f.fecha_emision BETWEEN ${desde} AND ${hasta}
      ORDER BY df.producto_id, f.local_id, f.fecha_emision DESC
    )
    SELECT
      up.producto_id AS "productoId",
      up.producto_nombre AS "productoNombre",
      up.unidad_medida AS "unidadMedida",
      up.proveedor_id AS "proveedorId",
      up.proveedor_nombre AS "proveedorNombre",
      up.categoria AS "categoria",
      up.local_id AS "localId",
      loc.nombre AS "localNombre",
      COALESCE(ua.precio, pp.precio) AS "precioBase",
      COALESCE(ua.fecha, pp.fecha) AS "fechaBase",
      up.precio AS "precioActual",
      up.fecha AS "fechaActual",
      CASE
        WHEN COALESCE(ua.precio, pp.precio) IS NOT NULL AND COALESCE(ua.precio, pp.precio) > 0
          AND up.precio IS DISTINCT FROM COALESCE(ua.precio, pp.precio)
        THEN ROUND(((up.precio - COALESCE(ua.precio, pp.precio)) / COALESCE(ua.precio, pp.precio)) * 100, 2)
        ELSE NULL
      END AS "porcentajeAumento"
    FROM ultimo_periodo up
    LEFT JOIN ultimo_antes ua ON ua.producto_id = up.producto_id AND ua.local_id IS NOT DISTINCT FROM up.local_id
    LEFT JOIN primero_periodo pp ON pp.producto_id = up.producto_id AND pp.local_id IS NOT DISTINCT FROM up.local_id
    LEFT JOIN alq_locales loc ON loc.id = up.local_id
    WHERE (${localIdsLit}::int[] IS NULL OR up.local_id = ANY(${localIdsLit}::int[]))
      AND (${proveedorId}::int IS NULL OR up.proveedor_id = ${proveedorId})
      AND (${categoria}::text IS NULL OR up.categoria = ${categoria})
    ORDER BY "porcentajeAumento" DESC NULLS LAST
  `);

  return resultado.rows as unknown as FilaDeltaPrecio[];
}

/** Gasto total (suma de subtotales) dentro del período, opcionalmente por local. */
export async function obtenerGastoTotalPeriodo(filtros: FiltrosReporte): Promise<number> {
  const { desde, hasta, localIds } = filtros;
  const localIdsLit = literalArrayInt(localIds);
  const resultado = await db.execute(sql`
    SELECT COALESCE(SUM(df.subtotal), 0) AS total
    FROM cp_detalle_facturas df
    JOIN cp_facturas f ON f.id = df.factura_id
    WHERE f.fecha_emision BETWEEN ${desde} AND ${hasta}
      AND (${localIdsLit}::int[] IS NULL OR f.local_id = ANY(${localIdsLit}::int[]))
  `);
  return Number((resultado.rows[0] as { total: string }).total);
}

/** Gasto del período agrupado por categoría de proveedor — para el donut de "share
 * of wallet" de la propuesta original. */
export async function obtenerGastoPorCategoria(
  filtros: FiltrosReporte
): Promise<{ categoria: CategoriaInsumo; total: number }[]> {
  const { desde, hasta, localIds } = filtros;
  const localIdsLit = literalArrayInt(localIds);
  const resultado = await db.execute(sql`
    SELECT prov.categoria AS categoria, COALESCE(SUM(df.subtotal), 0) AS total
    FROM cp_detalle_facturas df
    JOIN cp_facturas f ON f.id = df.factura_id
    JOIN cp_productos p ON p.id = df.producto_id
    JOIN cp_proveedores prov ON prov.id = p.proveedor_id
    WHERE f.fecha_emision BETWEEN ${desde} AND ${hasta}
      AND (${localIdsLit}::int[] IS NULL OR f.local_id = ANY(${localIdsLit}::int[]))
    GROUP BY prov.categoria
    ORDER BY total DESC
  `);
  return (resultado.rows as { categoria: CategoriaInsumo; total: string }[]).map((r) => ({
    categoria: r.categoria,
    total: Number(r.total),
  }));
}

export type CompraDetalle = {
  facturaId: number;
  fechaEmision: string;
  localNombre: string | null;
  cantidad: string;
  precioUnitario: string | null;
  subtotal: string | null;
  subtotalImpreso: string | null;
  // false = tiene descuento propio y no reconcilia (o no hay subtotal impreso
  // contra qué comparar) — este renglón no entra al gasto verificado. Null =
  // no aplica el chequeo (sin precio, o sin descuento y por lo tanto sin
  // ambigüedad que verificar).
  verificado: boolean | null;
};

export type FilaHistorialCompras = {
  productoId: number;
  productoNombre: string;
  unidadMedida: string;
  proveedorId: number;
  proveedorNombre: string;
  categoria: CategoriaInsumo;
  // Solo se completan cuando obtenerHistorialComprasPorProducto se llama con
  // agruparPorLocal=true (ver ahí) — en el modo default quedan en null porque el
  // producto ya viene agregado entre todos los locales, no tiene un único dueño.
  localId: number | null;
  localNombre: string | null;
  cantidadTotal: number;
  cantidadVerificada: number;
  gastoVerificado: number;
  gastoSinVerificar: number;
  itemsSinVerificar: number;
  precioPromedioPonderado: number | null;
  // Precio unitario (ya con el ajuste del 15,4% para El Criollo/HORECA aplicado)
  // de la compra más reciente del período — no un promedio, para poder comparar
  // de un vistazo "cuánto pago HOY por esto" contra otro proveedor sin abrir la
  // hoja de Precios aparte.
  precioUnitarioUltimo: string | null;
  itemsSinPrecio: number;
  primeraFecha: string;
  ultimaFecha: string;
  compras: CompraDetalle[];
};

/**
 * Cantidad y gasto real por producto dentro de [desde, hasta] — a diferencia de
 * obtenerDeltaPrecios() (que compara precio inicio vs. fin), esto suma TODAS las
 * compras del período para responder "¿cuánto compré de este producto y cuánto
 * pagué en total?". Local combinado a propósito (mismo criterio que el resto del
 * reporte): si hace falta ver un restaurante puntual, se filtra por `localId`.
 *
 * GASTO VERIFICADO VS. SIN VERIFICAR — el subtotal de cada renglón lo calcula
 * siempre el sistema (cantidad × precio_unitario − descuento, ver
 * confirmarFactura() en app/control-precios/actions.ts). Cuando el renglón no
 * tiene descuento propio, ese cálculo es exacto por construcción (no hay nada que
 * el descuento pueda arruinar) y se cuenta directo como gasto verificado. Cuando
 * SÍ tiene descuento, el campo depende de que la IA lo haya leído bien — para esos
 * casos se exige que el subtotal calculado coincida (dentro de
 * TOLERANCIA_SUBTOTAL) con el subtotal_impreso, el número tal cual está en el
 * papel. Si no coincide o no hay subtotal_impreso para comparar, ese renglón NO
 * entra al gasto verificado — se sigue sumando a cantidadTotal (eso sí es 100%
 * confiable, viene directo del papel) pero su plata queda aparte en
 * gastoSinVerificar, nunca mezclada en el número que se usa para decisiones. Ver
 * decisión del usuario en TOLERANCIA_SUBTOTAL: mostrar una cifra de gasto que no
 * se puede comprobar es peor que no mostrarla.
 *
 * El precio promedio pondera por cantidad (gastoVerificado / cantidadVerificada),
 * no es un promedio simple de precios unitarios — así una compra grande pesa más
 * que una chica, igual que pesa en la plata real gastada.
 *
 * PRECIO REAL (El Criollo / HORECA) — el precio_unitario y el subtotal de estos
 * dos proveedores se multiplican por FACTOR_PRECIO_REAL_ADICIONAL (0.94) antes
 * de sumarse a cantidadVerificada/gastoVerificado o de guardarse en `compras`,
 * para reflejar el 6% adicional que facturan sobre el total y que su
 * precio_unitario impreso no incluye (ver constantes.ts). El resto de los
 * proveedores (FEMSA incluido) son distribuidoras directas sin ese mecanismo,
 * así que quedan con su precio_unitario tal cual viene facturado. Este ajuste
 * se aplica SIEMPRE DESPUÉS de decidir si el renglón está verificado — nunca
 * antes, para no mezclar una corrección de negocio con la verificación de
 * calidad de dato.
 *
 * agruparPorLocal=true parte cada producto en una fila POR RESTAURANTE (mismo
 * criterio que ya se usa en obtenerDeltaPrecios) en vez de sumar todos los
 * locales juntos — para el Excel que se manda afuera, donde cada restaurante es
 * en la práctica una empresa distinta y mezclar su consumo en una sola fila no
 * sirve para decidir nada. La pantalla en pantalla sigue usando el default
 * (false, agregado) para no cambiarle el comportamiento a nadie que no lo pidió.
 */
export async function obtenerHistorialComprasPorProducto(
  filtros: FiltrosReporte,
  agruparPorLocal: boolean = false
): Promise<FilaHistorialCompras[]> {
  const { desde, hasta, localIds, proveedorId = null, categoria = null } = filtros;
  const localIdsLit = literalArrayInt(localIds);
  const resultado = await db.execute(sql`
    SELECT
      p.id AS "productoId", p.nombre AS "productoNombre", p.unidad_medida AS "unidadMedida",
      prov.id AS "proveedorId", prov.nombre AS "proveedorNombre", prov.categoria AS "categoria",
      f.id AS "facturaId", f.fecha_emision AS "fechaEmision", f.local_id AS "localId", loc.nombre AS "localNombre",
      df.cantidad AS "cantidad", df.precio_unitario AS "precioUnitario", df.subtotal AS "subtotal",
      df.descuento AS "descuento", df.subtotal_impreso AS "subtotalImpreso", df.verificado_manual AS "verificadoManual"
    FROM cp_detalle_facturas df
    JOIN cp_facturas f ON f.id = df.factura_id
    JOIN cp_productos p ON p.id = df.producto_id
    JOIN cp_proveedores prov ON prov.id = p.proveedor_id
    LEFT JOIN alq_locales loc ON loc.id = f.local_id
    WHERE f.fecha_emision BETWEEN ${desde} AND ${hasta}
      AND (${localIdsLit}::int[] IS NULL OR f.local_id = ANY(${localIdsLit}::int[]))
      AND (${proveedorId}::int IS NULL OR prov.id = ${proveedorId})
      AND (${categoria}::text IS NULL OR prov.categoria = ${categoria})
    ORDER BY p.nombre, f.fecha_emision ASC
  `);

  type FilaCruda = {
    productoId: number;
    productoNombre: string;
    unidadMedida: string;
    proveedorId: number;
    proveedorNombre: string;
    categoria: CategoriaInsumo;
    facturaId: number;
    fechaEmision: string;
    localId: number | null;
    localNombre: string | null;
    cantidad: string;
    precioUnitario: string | null;
    subtotal: string | null;
    descuento: string | null;
    subtotalImpreso: string | null;
    verificadoManual: boolean;
  };

  const porProducto = new Map<string, FilaHistorialCompras>();
  for (const r of resultado.rows as FilaCruda[]) {
    const clave = agruparPorLocal ? `${r.productoId}:${r.localId ?? "sin-local"}` : String(r.productoId);
    let fila = porProducto.get(clave);
    if (!fila) {
      fila = {
        productoId: r.productoId,
        productoNombre: r.productoNombre,
        unidadMedida: r.unidadMedida,
        proveedorId: r.proveedorId,
        proveedorNombre: r.proveedorNombre,
        categoria: r.categoria,
        localId: agruparPorLocal ? r.localId : null,
        localNombre: agruparPorLocal ? r.localNombre : null,
        cantidadTotal: 0,
        cantidadVerificada: 0,
        gastoVerificado: 0,
        gastoSinVerificar: 0,
        itemsSinVerificar: 0,
        precioPromedioPonderado: null,
        precioUnitarioUltimo: null,
        itemsSinPrecio: 0,
        primeraFecha: r.fechaEmision,
        ultimaFecha: r.fechaEmision,
        compras: [],
      };
      porProducto.set(clave, fila);
    }

    const cantidad = Number(r.cantidad);
    fila.cantidadTotal += cantidad;

    // El chequeo de verificado SIEMPRE compara los números crudos (lo que
    // calculamos vs. lo impreso en el papel) — es una cuestión de calidad de
    // dato, no del ajuste de negocio de abajo. El ajuste de "precio real"
    // (El Criollo/HORECA) se aplica DESPUÉS, sobre lo que ya se consideró
    // confiable, nunca antes de esa comparación.
    const factorAjuste = PROVEEDORES_CON_AJUSTE_10_6.includes(r.proveedorNombre)
      ? FACTOR_PRECIO_REAL_ADICIONAL
      : 1;

    let verificado: boolean | null = null;
    let subtotalReal: number | null = null;
    if (r.precioUnitario === null || r.subtotal === null) {
      fila.itemsSinPrecio += 1;
    } else if (r.descuento === null) {
      // Sin descuento propio: el subtotal es cantidad × precio_unitario exacto,
      // no hay nada que el descuento pueda haber arruinado.
      verificado = true;
      subtotalReal = Number(r.subtotal) * factorAjuste;
      fila.cantidadVerificada += cantidad;
      fila.gastoVerificado += subtotalReal;
    } else if (
      r.subtotalImpreso !== null &&
      Math.abs(Number(r.subtotal) - Number(r.subtotalImpreso)) <= TOLERANCIA_SUBTOTAL
    ) {
      // Tiene descuento, pero el cálculo reconcilia contra lo impreso en el papel.
      verificado = true;
      subtotalReal = Number(r.subtotal) * factorAjuste;
      fila.cantidadVerificada += cantidad;
      fila.gastoVerificado += subtotalReal;
    } else if (r.verificadoManual) {
      // No reconcilia contra subtotal_impreso, pero ya se confirmó a mano por
      // otra vía (ej. subtotal_impreso quedó tomado de una columna con
      // impuestos, no la neta — ver comentario en el schema).
      verificado = true;
      subtotalReal = Number(r.subtotal) * factorAjuste;
      fila.cantidadVerificada += cantidad;
      fila.gastoVerificado += subtotalReal;
    } else {
      // Tiene descuento y no reconcilia (o no hay subtotal impreso para
      // comparar) — no se puede comprobar, no entra al gasto verificado.
      verificado = false;
      subtotalReal = Number(r.subtotal) * factorAjuste;
      fila.itemsSinVerificar += 1;
      fila.gastoSinVerificar += subtotalReal;
    }

    if (r.fechaEmision < fila.primeraFecha) fila.primeraFecha = r.fechaEmision;
    if (r.fechaEmision > fila.ultimaFecha) fila.ultimaFecha = r.fechaEmision;
    // Filas vienen ordenadas por fecha ASC (ver ORDER BY de la query) — la
    // última asignación con precio no nulo es, por construcción, la más reciente.
    if (r.precioUnitario !== null) {
      fila.precioUnitarioUltimo = (Number(r.precioUnitario) * factorAjuste).toFixed(2);
    }
    fila.compras.push({
      facturaId: r.facturaId,
      fechaEmision: r.fechaEmision,
      localNombre: r.localNombre,
      cantidad: r.cantidad,
      precioUnitario: r.precioUnitario !== null ? (Number(r.precioUnitario) * factorAjuste).toFixed(2) : null,
      subtotal: subtotalReal !== null ? subtotalReal.toFixed(2) : null,
      subtotalImpreso: r.subtotalImpreso,
      verificado,
    });
  }

  const filas = Array.from(porProducto.values());
  for (const fila of filas) {
    fila.precioPromedioPonderado =
      fila.cantidadVerificada > 0 ? fila.gastoVerificado / fila.cantidadVerificada : null;
  }
  // Gasto verificado descendente: lo que más plata comprobada mueve arriba, mismo
  // criterio que el resto de los reportes de este módulo.
  filas.sort((a, b) => b.gastoVerificado - a.gastoVerificado);
  return filas;
}

// A partir de este % de diferencia entre el más barato y el más caro, se marca
// como alerta de "mismo proveedor, distinto precio por restaurante".
const UMBRAL_DIFERENCIA_ENTRE_RESTAURANTES = 10;

export type ComparacionEntreRestaurantes = {
  productoId: number;
  productoNombre: string;
  proveedorNombre: string;
  localMasBarato: string;
  precioMinimo: string;
  fechaMasBarato: string;
  facturaIdMasBarato: number;
  localMasCaro: string;
  precioMaximo: string;
  fechaMasCaro: string;
  facturaIdMasCaro: number;
  porcentajeDiferencia: string;
};

/**
 * Mismo proveedor, mismo producto (cp_productos ya está scopeado por proveedor,
 * así que "mismo producto" implica "mismo proveedor" automáticamente), con un
 * precio que difiere entre restaurantes en más de
 * UMBRAL_DIFERENCIA_ENTRE_RESTAURANTES%.
 *
 * OJO: NO compara "el último precio conocido de cada local" — eso rompía casos
 * reales cuando un local tenía una compra bien reciente Y otra más vieja del
 * mismo producto: si la compra MÁS reciente de ese local quedaba lejos en el
 * tiempo de la del otro local, se perdía la comparación válida que sí existía
 * entre dos compras cercanas en fecha (ver caso "Manos Negras" 2026-07-24).
 * En cambio, arma TODOS los pares posibles de compras de locales distintos
 * para un mismo producto, se queda solo con los pares a
 * DIAS_MAX_DIFERENCIA_COMPARACION_RESTAURANTES días o menos entre sí (si un
 * local no cargó nada reciente de ese producto, la diferencia contra una
 * compra vieja del otro local no es comprobable — puede ser solo que falte
 * cargar la compra de hoy), y de esos pares válidos muestra el más reciente.
 * Devuelve también el id de cada factura (para poder abrir el comprobante
 * original de cada lado y comparar a simple vista, ver
 * /api/control-precios/ver-comprobante/[facturaId]).
 */
export async function obtenerComparacionEntreRestaurantes(): Promise<ComparacionEntreRestaurantes[]> {
  const resultado = await db.execute(sql`
    WITH observaciones AS (
      SELECT df.producto_id, f.local_id, df.precio_unitario AS precio, f.fecha_emision AS fecha, f.id AS factura_id
      FROM cp_detalle_facturas df
      JOIN cp_facturas f ON f.id = df.factura_id
      -- precio_unitario = 0 casi siempre es un error de extracción (ver
      -- obtenerItemsPrecioCero) y rompería la división de más abajo — se excluye acá.
      WHERE df.precio_unitario IS NOT NULL AND df.precio_unitario > 0 AND f.local_id IS NOT NULL
    ),
    pares AS (
      SELECT
        a.producto_id,
        CASE WHEN a.precio <= b.precio THEN a.local_id ELSE b.local_id END AS local_barato_id,
        LEAST(a.precio, b.precio) AS precio_barato,
        CASE WHEN a.precio <= b.precio THEN a.fecha ELSE b.fecha END AS fecha_barato,
        CASE WHEN a.precio <= b.precio THEN a.factura_id ELSE b.factura_id END AS factura_barato_id,
        CASE WHEN a.precio <= b.precio THEN b.local_id ELSE a.local_id END AS local_caro_id,
        GREATEST(a.precio, b.precio) AS precio_caro,
        CASE WHEN a.precio <= b.precio THEN b.fecha ELSE a.fecha END AS fecha_caro,
        CASE WHEN a.precio <= b.precio THEN b.factura_id ELSE a.factura_id END AS factura_caro_id,
        GREATEST(a.fecha, b.fecha) AS fecha_mas_reciente
      FROM observaciones a
      JOIN observaciones b ON a.producto_id = b.producto_id AND a.local_id < b.local_id
      WHERE ABS(a.fecha - b.fecha) <= ${DIAS_MAX_DIFERENCIA_COMPARACION_RESTAURANTES}
        AND GREATEST(a.precio, b.precio) > LEAST(a.precio, b.precio) * (1 + ${UMBRAL_DIFERENCIA_ENTRE_RESTAURANTES / 100}::numeric)
    )
    SELECT * FROM (
      SELECT DISTINCT ON (pr.producto_id)
        p.id AS "productoId", p.nombre AS "productoNombre", prov.nombre AS "proveedorNombre",
        locBarato.nombre AS "localMasBarato", pr.precio_barato AS "precioMinimo",
        pr.fecha_barato AS "fechaMasBarato", pr.factura_barato_id AS "facturaIdMasBarato",
        locCaro.nombre AS "localMasCaro", pr.precio_caro AS "precioMaximo",
        pr.fecha_caro AS "fechaMasCaro", pr.factura_caro_id AS "facturaIdMasCaro",
        ROUND((pr.precio_caro - pr.precio_barato) / pr.precio_barato * 100, 2) AS "porcentajeDiferencia"
      FROM pares pr
      JOIN cp_productos p ON p.id = pr.producto_id
      JOIN cp_proveedores prov ON prov.id = p.proveedor_id
      JOIN alq_locales locBarato ON locBarato.id = pr.local_barato_id
      JOIN alq_locales locCaro ON locCaro.id = pr.local_caro_id
      -- por producto, el par válido más reciente; a igual fecha, el de mayor diferencia.
      ORDER BY pr.producto_id, pr.fecha_mas_reciente DESC, (pr.precio_caro - pr.precio_barato) DESC
    ) sub
    ORDER BY "porcentajeDiferencia" DESC
  `);
  return resultado.rows as ComparacionEntreRestaurantes[];
}

export type ItemPendienteDePrecio = {
  detalleId: number;
  facturaId: number;
  productoNombre: string;
  cantidad: string;
  unidadMedida: string;
  proveedorNombre: string;
  localNombre: string | null;
  fechaEmision: string;
};

/** Ítems ya confirmados que se quedaron sin precio (VERDULERIA sin match en la
 * referencia de 5cynar, u otro caso manual) — la factura queda en
 * 'pendiente_revision' hasta que se les asigne un precio acá. */
export async function obtenerItemsPendientesDePrecio(): Promise<ItemPendienteDePrecio[]> {
  const resultado = await db.execute(sql`
    SELECT df.id AS "detalleId", df.factura_id AS "facturaId", p.nombre AS "productoNombre",
      df.cantidad, p.unidad_medida AS "unidadMedida", prov.nombre AS "proveedorNombre",
      loc.nombre AS "localNombre", f.fecha_emision AS "fechaEmision"
    FROM cp_detalle_facturas df
    JOIN cp_facturas f ON f.id = df.factura_id
    JOIN cp_productos p ON p.id = df.producto_id
    JOIN cp_proveedores prov ON prov.id = p.proveedor_id
    LEFT JOIN alq_locales loc ON loc.id = f.local_id
    WHERE df.precio_unitario IS NULL
    ORDER BY f.fecha_emision DESC
  `);
  return resultado.rows as ItemPendienteDePrecio[];
}

export type ItemPrecioCero = {
  detalleId: number;
  facturaId: number;
  productoNombre: string;
  cantidad: string;
  proveedorNombre: string;
  localNombre: string | null;
  fechaEmision: string;
};

/** Ítems con precio_unitario = 0 — casi siempre la IA extrajo una línea que no es
 * un producto (percepciones de IVA, retenciones, bonificaciones) como si fuera un
 * ítem comprado. Rompería divisiones en otras consultas (ver
 * obtenerComparacionEntreRestaurantes) además de ensuciar el reporte, por eso se
 * revisa acá: se borra si no es un producto real, o se le asigna el precio real
 * si la IA simplemente no lo leyó. */
export async function obtenerItemsPrecioCero(): Promise<ItemPrecioCero[]> {
  const resultado = await db.execute(sql`
    SELECT df.id AS "detalleId", df.factura_id AS "facturaId", p.nombre AS "productoNombre",
      df.cantidad, prov.nombre AS "proveedorNombre", loc.nombre AS "localNombre", f.fecha_emision AS "fechaEmision"
    FROM cp_detalle_facturas df
    JOIN cp_facturas f ON f.id = df.factura_id
    JOIN cp_productos p ON p.id = df.producto_id
    JOIN cp_proveedores prov ON prov.id = p.proveedor_id
    LEFT JOIN alq_locales loc ON loc.id = f.local_id
    WHERE df.precio_unitario = 0
    ORDER BY f.fecha_emision DESC
  `);
  return resultado.rows as ItemPrecioCero[];
}

export type FilaListaParaEmparejar = {
  id: number;
  codigoProveedor: string;
  descripcion: string;
  presentacion: string | null;
  categoria: string | null;
  precioLista: string;
  precioConBonificacion: string | null;
  // id de la fila del OTRO proveedor con la que ya está emparejada, o null si
  // todavía no tiene par confirmado.
  parLadoId: number | null;
  // id del par en cp_pares_precios_proveedores (para poder desemparejar) — null
  // junto con parLadoId cuando no hay par.
  parId: number | null;
};

/**
 * Trae las dos listas completas (El Criollo y El Emporio) con el estado de
 * emparejado de cada renglón, para la pantalla de "confirmar a mano qué
 * producto de una lista es el mismo que cuál de la otra" — no hay match
 * automático posible entre proveedores (nombres no coinciden, ver
 * DESCUENTO_LISTA_EL_CRIOLLO / comparación de listas real).
 */
export async function obtenerListasParaEmparejar(): Promise<{
  criollo: FilaListaParaEmparejar[];
  emporio: FilaListaParaEmparejar[];
}> {
  const [criolloId, emporioId] = await Promise.all([
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO),
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const resultado = await db.execute(sql`
    SELECT lp.id, lp.proveedor_id AS "proveedorId", lp.codigo_proveedor AS "codigoProveedor",
      lp.descripcion, lp.presentacion, lp.categoria,
      lp.precio_lista AS "precioLista", lp.precio_con_bonificacion AS "precioConBonificacion",
      CASE WHEN par.lista_a_id = lp.id THEN par.lista_b_id ELSE par.lista_a_id END AS "parLadoId",
      par.id AS "parId"
    FROM cp_listas_precios_proveedor lp
    LEFT JOIN cp_pares_precios_proveedores par
      ON (par.lista_a_id = lp.id OR par.lista_b_id = lp.id) AND par.confirmado = true
    WHERE lp.proveedor_id IN (${criolloId}, ${emporioId})
    ORDER BY lp.categoria NULLS LAST, lp.descripcion
  `);

  type Fila = FilaListaParaEmparejar & { proveedorId: number };
  const filas = resultado.rows as Fila[];
  return {
    criollo: filas.filter((f) => f.proveedorId === criolloId),
    emporio: filas.filter((f) => f.proveedorId === emporioId),
  };
}

export type FilaComparacionProveedores = {
  parId: number;
  nombreCriollo: string;
  categoria: string | null;
  precioCriollo: number;
  esEstimadoCriollo: boolean;
  fechaCriollo: string | null;
  nombreEmporio: string;
  precioEmporio: number;
  esEstimadoEmporio: boolean;
  fechaEmporio: string | null;
  masBarato: "criollo" | "emporio" | "igual";
  porcentajeDiferencia: number;
};

type FilaParCriolloEmporioCruda = {
  parId: number;
  nombreCriollo: string;
  categoria: string | null;
  precioListaCriollo: string;
  precioRealCriollo: string | null;
  fechaCriollo: string | null;
  nombreEmporio: string;
  precioListaEmporio: string;
  precioBonifEmporio: string | null;
  precioRealEmporio: string | null;
  fechaEmporio: string | null;
  motivo: string | null;
};

/** Trae los pares Criollo↔Emporio (confirmados o sugerencias pendientes, según
 * `confirmado`) con el último precio real de cada lado, si existe. Compartida
 * por obtenerComparacionCriolloEmporio() y obtenerSugerenciasPendientes() para
 * no duplicar el join — la única diferencia entre ambas es el filtro sobre
 * `confirmado` y si se expone `motivo`. */
async function obtenerParesCriolloEmporio(confirmado: boolean): Promise<FilaParCriolloEmporioCruda[]> {
  const [criolloId, emporioId] = await Promise.all([
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_CRIOLLO),
    buscarProveedorIdPorNombre(NOMBRE_PROVEEDOR_EL_EMPORIO),
  ]);

  const resultado = await db.execute(sql`
    WITH pares_normalizados AS (
      SELECT
        par.id AS par_id, par.motivo AS motivo,
        CASE WHEN la.proveedor_id = ${criolloId} THEN la.id ELSE lb.id END AS criollo_lista_id,
        CASE WHEN la.proveedor_id = ${emporioId} THEN la.id ELSE lb.id END AS emporio_lista_id
      FROM cp_pares_precios_proveedores par
      JOIN cp_listas_precios_proveedor la ON la.id = par.lista_a_id
      JOIN cp_listas_precios_proveedor lb ON lb.id = par.lista_b_id
      WHERE par.confirmado = ${confirmado}
    ),
    ultimo_precio_real AS (
      SELECT DISTINCT ON (df.producto_id) df.producto_id, df.precio_unitario, f.fecha_emision
      FROM cp_detalle_facturas df
      JOIN cp_facturas f ON f.id = df.factura_id
      WHERE df.precio_unitario IS NOT NULL
      ORDER BY df.producto_id, f.fecha_emision DESC
    )
    SELECT
      pn.par_id AS "parId", pn.motivo AS "motivo",
      lc.descripcion AS "nombreCriollo", lc.categoria AS "categoria", lc.precio_lista AS "precioListaCriollo",
      upc.precio_unitario AS "precioRealCriollo", upc.fecha_emision AS "fechaCriollo",
      le.descripcion AS "nombreEmporio",
      le.precio_lista AS "precioListaEmporio", le.precio_con_bonificacion AS "precioBonifEmporio",
      upe.precio_unitario AS "precioRealEmporio", upe.fecha_emision AS "fechaEmporio"
    FROM pares_normalizados pn
    JOIN cp_listas_precios_proveedor lc ON lc.id = pn.criollo_lista_id
    JOIN cp_listas_precios_proveedor le ON le.id = pn.emporio_lista_id
    LEFT JOIN ultimo_precio_real upc ON upc.producto_id = lc.producto_id
    LEFT JOIN ultimo_precio_real upe ON upe.producto_id = le.producto_id
    ORDER BY lc.categoria NULLS LAST, lc.descripcion
  `);

  return resultado.rows as FilaParCriolloEmporioCruda[];
}

function calcularComparacion(r: FilaParCriolloEmporioCruda): FilaComparacionProveedores {
  const esEstimadoCriollo = r.precioRealCriollo === null;
  const precioCriollo = esEstimadoCriollo
    ? Number(r.precioListaCriollo) * (1 - DESCUENTO_LISTA_EL_CRIOLLO / 100)
    : Number(r.precioRealCriollo) * FACTOR_PRECIO_REAL_ADICIONAL;

  const esEstimadoEmporio = r.precioRealEmporio === null;
  const precioEmporio = esEstimadoEmporio
    ? Number(r.precioBonifEmporio ?? r.precioListaEmporio)
    : Number(r.precioRealEmporio);

  let masBarato: "criollo" | "emporio" | "igual" = "igual";
  if (precioCriollo < precioEmporio) masBarato = "criollo";
  else if (precioEmporio < precioCriollo) masBarato = "emporio";
  const caro = Math.max(precioCriollo, precioEmporio);
  const barato = Math.min(precioCriollo, precioEmporio);
  const porcentajeDiferencia = barato > 0 ? ((caro - barato) / barato) * 100 : 0;

  return {
    parId: r.parId,
    nombreCriollo: r.nombreCriollo,
    categoria: r.categoria,
    precioCriollo,
    esEstimadoCriollo,
    fechaCriollo: r.fechaCriollo,
    nombreEmporio: r.nombreEmporio,
    precioEmporio,
    esEstimadoEmporio,
    fechaEmporio: r.fechaEmporio,
    masBarato,
    porcentajeDiferencia: Math.round(porcentajeDiferencia * 100) / 100,
  };
}

/**
 * Compara, para cada par CONFIRMADO, el precio de El Criollo contra el de El
 * Emporio — priorizando SIEMPRE el último precio real pagado (de
 * cp_detalle_facturas) por sobre el precio de lista, para ambos lados por
 * igual.
 * - El Criollo REAL: precio_unitario × FACTOR_PRECIO_REAL_ADICIONAL (0.94) —
 *   el precio_unitario de la factura ya trae el 10% de descuento de lista,
 *   pero no el 6% adicional sobre el total, así que se completa acá para que
 *   el precio real quede en el mismo 15.4% combinado que la estimación de
 *   abajo (ver constantes.ts).
 * - El Criollo ESTIMADO (sin compra real todavía): precio_lista ×
 *   (1 − DESCUENTO_LISTA_EL_CRIOLLO/100) — mismo 15.4% combinado, aplicado
 *   directo sobre el precio de lista en vez de sobre un precio ya facturado.
 * - El Emporio: se usa precio_con_bonificacion tal cual (ya es el precio
 *   final negociado, confirmado por el usuario) — sin ajuste, real o estimado.
 */
export async function obtenerComparacionCriolloEmporio(): Promise<FilaComparacionProveedores[]> {
  const filas = await obtenerParesCriolloEmporio(true);
  return filas.map(calcularComparacion);
}

export type FilaSugerenciaPar = FilaComparacionProveedores & { motivo: string | null };

/**
 * Pares SUGERIDOS pero todavía sin confirmar — candidatos que la IA identificó
 * leyendo ambas descripciones (o encontró con similitud parcial) pero no
 * quedaron cargados como definitivos porque hay alguna duda real (tamaño de
 * envase distinto, compite con otro candidato, posible marca distinta, etc.,
 * ver `motivo`). Se muestran con el mismo cálculo de precio que la comparación
 * confirmada, para que quien las revise tenga el contexto completo — pero no
 * entran a obtenerComparacionCriolloEmporio() hasta que alguien las confirme.
 */
export async function obtenerSugerenciasPendientes(): Promise<FilaSugerenciaPar[]> {
  const filas = await obtenerParesCriolloEmporio(false);
  return filas.map((r) => ({ ...calcularComparacion(r), motivo: r.motivo }));
}

export type FilaDeltaListaProveedor = {
  codigoProveedor: string;
  descripcion: string;
  categoria: string | null;
  precioAnterior: number;
  fechaAnterior: string;
  archivoAnterior: string;
  precioNuevo: number;
  fechaNueva: string;
  archivoNuevo: string;
  porcentajeVariacion: number;
};

type FilaDeltaListaCruda = {
  codigoProveedor: string;
  descripcion: string;
  categoria: string | null;
  precioListaAnterior: string;
  precioBonifAnterior: string | null;
  fechaAnterior: string;
  archivoAnterior: string;
  precioListaNuevo: string;
  precioBonifNuevo: string | null;
  fechaNueva: string;
  archivoNuevo: string;
};

/**
 * Compara la última importación de la lista de precios de UN proveedor contra
 * la anterior, código por código (el código de proveedor es estable entre
 * importaciones del mismo proveedor, a diferencia del nombre) — a diferencia
 * de obtenerComparacionCriolloEmporio(), que cruza dos proveedores distintos
 * en un mismo momento, esto es la MISMA lista en dos fechas (ver
 * cp_listas_precios_importaciones/historial en db/schema.ts).
 *
 * Filtra a solo productos vinculados a nuestro propio catálogo (producto_id
 * no nulo en la importación nueva) para enfocarse en productos reales que la
 * empresa compra, no en cualquier renglón del catálogo del proveedor sin
 * interés (decisión del usuario, 2026-07-27).
 *
 * Si el proveedor tiene el ajuste 10%+6% (El Criollo/HORECA), se le resta el
 * DESCUENTO_LISTA_EL_CRIOLLO combinado a AMBOS precios de lista antes de
 * comparar (mismo criterio que la rama "estimado" de calcularComparacion) —
 * aplicarlo a los dos por igual no cambia el % de variación, pero sí el
 * precio absoluto que se muestra, que tiene que ser el real, no el de lista
 * sin descontar.
 *
 * Devuelve [] si el proveedor todavía no tiene dos importaciones para
 * comparar (solo se cargó una vez, o ninguna).
 *
 * Devuelve también el `archivoOrigen` de cada lado (no solo `importadoEn`):
 * el archivo puede cargarse varios días después de la fecha que tiene en su
 * propio nombre (ej. "20-7" subido recién el 23/7) — mostrar solo la fecha de
 * carga es engañoso, el nombre de archivo es lo que realmente identifica qué
 * versión de la lista se está comparando.
 */
export async function obtenerDeltaListaMismoProveedor(
  proveedorId: number,
  proveedorNombre: string
): Promise<FilaDeltaListaProveedor[]> {
  const resultado = await db.execute(sql`
    WITH importaciones AS (
      SELECT id, importado_en, archivo_origen, ROW_NUMBER() OVER (ORDER BY importado_en DESC) AS rn
      FROM cp_listas_precios_importaciones
      WHERE proveedor_id = ${proveedorId}
    ),
    nueva AS (SELECT id, importado_en, archivo_origen FROM importaciones WHERE rn = 1),
    anterior AS (SELECT id, importado_en, archivo_origen FROM importaciones WHERE rn = 2)
    SELECT
      hn.codigo_proveedor AS "codigoProveedor",
      hn.descripcion AS "descripcion",
      hn.categoria AS "categoria",
      ha.precio_lista AS "precioListaAnterior", ha.precio_con_bonificacion AS "precioBonifAnterior",
      an.importado_en AS "fechaAnterior", an.archivo_origen AS "archivoAnterior",
      hn.precio_lista AS "precioListaNuevo", hn.precio_con_bonificacion AS "precioBonifNuevo",
      nv.importado_en AS "fechaNueva", nv.archivo_origen AS "archivoNuevo"
    FROM nueva nv
    CROSS JOIN anterior an
    JOIN cp_listas_precios_historial hn ON hn.importacion_id = nv.id
    JOIN cp_listas_precios_historial ha ON ha.importacion_id = an.id AND ha.codigo_proveedor = hn.codigo_proveedor
    WHERE hn.producto_id IS NOT NULL
    ORDER BY hn.categoria NULLS LAST, hn.descripcion
  `);

  const aplicaAjuste = PROVEEDORES_CON_AJUSTE_10_6.includes(proveedorNombre);
  const precioAjustado = (precioLista: string, precioBonif: string | null) =>
    aplicaAjuste
      ? Number(precioLista) * (1 - DESCUENTO_LISTA_EL_CRIOLLO / 100)
      : Number(precioBonif ?? precioLista);

  return (resultado.rows as FilaDeltaListaCruda[])
    .map((f) => {
      const precioAnterior = precioAjustado(f.precioListaAnterior, f.precioBonifAnterior);
      const precioNuevo = precioAjustado(f.precioListaNuevo, f.precioBonifNuevo);
      const porcentajeVariacion =
        precioAnterior > 0 ? Math.round(((precioNuevo - precioAnterior) / precioAnterior) * 10000) / 100 : 0;
      return {
        codigoProveedor: f.codigoProveedor,
        descripcion: f.descripcion,
        categoria: f.categoria,
        precioAnterior,
        fechaAnterior: f.fechaAnterior,
        archivoAnterior: f.archivoAnterior,
        precioNuevo,
        fechaNueva: f.fechaNueva,
        archivoNuevo: f.archivoNuevo,
        porcentajeVariacion,
      };
    })
    .sort((a, b) => b.porcentajeVariacion - a.porcentajeVariacion);
}

