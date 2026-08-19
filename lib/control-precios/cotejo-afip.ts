// Coteja el export "Mis Comprobantes Recibidos" de ARCA/AFIP (Libro de IVA Digital)
// contra cp_facturas, por proveedor, para un restaurante y un período dados.
// Objetivo: detectar facturas que AFIP registra pero que no llegaron a cargarse
// (o llegaron con otro monto) en el circuito interno de carga de comprobantes.
// Usado tanto por scripts/cotejar-facturas-afip.ts (CLI) como por
// app/control-precios/cotejo-afip/actions.ts (página web).
//
// Estructura del Excel esperada (export real de "Mis Comprobantes Recibidos" de
// ARCA, confirmado contra un archivo real de julio 2026): encabezados en alguna
// fila temprana, una fila por comprobante, sin totales al pie. No es el mismo
// layout que la especificación de "importación" del Libro de IVA Digital (esa es
// para cargar datos a mano/por archivo; esto es lo que el portal devuelve ya
// completado) — por eso el mapeo de columnas es por nombre de encabezado, no por
// posición fija: si ARCA cambia el orden de columnas esto no se rompe, pero si
// cambia el TEXTO del encabezado, falla fuerte en vez de leer mal en silencio.

import ExcelJS from "exceljs";
import { db } from "@/db";
import { cpFacturas, cpProveedores, alqLocales, cpAfipExclusiones } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";

export type MotivoExclusionAfip = "ALQUILER" | "SERVICIO" | "OTRO";

// Tolerancia de redondeo entre el importe total de AFIP y el monto_total cargado
// (mismo orden de magnitud que TOLERANCIA_SUBTOTAL en control-precios, pero acá
// comparamos totales de comprobante completo, no renglones — un poco más de
// margen por redondeos de IVA/percepciones al tipear a mano).
const TOLERANCIA_MONTO = 5;

const HEADERS_REQUERIDOS = {
  fecha: "Fecha",
  tipo: "Tipo",
  puntoVenta: "Punto de Venta",
  numero: "Número Desde",
  cuitEmisor: "Nro. Doc. Emisor",
  denominacionEmisor: "Denominación Emisor",
  cuitReceptorCol: "Nro. Doc. Receptor",
  importeTotal: "Imp. Total",
} as const;

export type ComprobanteAfip = {
  fecha: string; // AAAA-MM-DD
  tipoLabel: string;
  esAjuste: boolean; // Nota de Crédito / Nota de Débito
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  denominacionEmisor: string;
  cuitReceptor: string;
  importeTotal: number;
};

export class ErrorParseoAfip extends Error {}

export async function parsearExcelAfip(buffer: ArrayBuffer | Buffer): Promise<ComprobanteAfip[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ErrorParseoAfip("El excel no tiene ninguna hoja.");

  let filaHeader = -1;
  let columnas: Record<keyof typeof HEADERS_REQUERIDOS, number> | null = null;
  for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
    const valores = (sheet.getRow(r).values as unknown[]).map((v) => (typeof v === "string" ? v.trim() : v));
    const mapa: Partial<Record<keyof typeof HEADERS_REQUERIDOS, number>> = {};
    for (const [clave, textoHeader] of Object.entries(HEADERS_REQUERIDOS)) {
      const idx = valores.findIndex((v) => v === textoHeader);
      if (idx >= 0) mapa[clave as keyof typeof HEADERS_REQUERIDOS] = idx;
    }
    if (Object.keys(mapa).length === Object.keys(HEADERS_REQUERIDOS).length) {
      filaHeader = r;
      columnas = mapa as Record<keyof typeof HEADERS_REQUERIDOS, number>;
      break;
    }
  }

  if (!columnas) {
    throw new ErrorParseoAfip(
      `No se encontraron todos los encabezados esperados (${Object.values(HEADERS_REQUERIDOS).join(", ")}) ` +
        `en las primeras 10 filas del excel. Si ARCA cambió los nombres de columna, hay que actualizar el parser.`
    );
  }

  const resultado: ComprobanteAfip[] = [];
  for (let r = filaHeader + 1; r <= sheet.rowCount; r++) {
    const v = sheet.getRow(r).values as unknown[];
    const fechaRaw = v[columnas.fecha];
    if (!fechaRaw) continue;

    const fecha = parsearFechaDDMMYYYY(String(fechaRaw));
    const tipoLabel = String(v[columnas.tipo] ?? "");
    resultado.push({
      fecha,
      tipoLabel,
      esAjuste: /nota de (cr[eé]dito|d[eé]bito)/i.test(tipoLabel),
      puntoVenta: Number(v[columnas.puntoVenta]),
      numero: Number(v[columnas.numero]),
      cuitEmisor: soloDigitos(String(v[columnas.cuitEmisor])),
      denominacionEmisor: String(v[columnas.denominacionEmisor] ?? "").trim(),
      cuitReceptor: soloDigitos(String(v[columnas.cuitReceptorCol])),
      importeTotal: Number(v[columnas.importeTotal]) || 0,
    });
  }
  return resultado;
}

function parsearFechaDDMMYYYY(raw: string): string {
  const [dd, mm, yyyy] = raw.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export function inferirPeriodo(comprobantes: ComprobanteAfip[]): string {
  const conteo = new Map<string, number>();
  for (const c of comprobantes) {
    const periodo = c.fecha.slice(0, 7);
    conteo.set(periodo, (conteo.get(periodo) ?? 0) + 1);
  }
  const [masFrecuente] = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  return masFrecuente[0];
}

export function rangoDePeriodo(periodo: string) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    throw new ErrorParseoAfip(`Período inválido: "${periodo}" (formato esperado AAAA-MM)`);
  }
  const [yyyy, mm] = periodo.split("-").map(Number);
  const inicio = `${periodo}-01`;
  const finExclusivo = mm === 12 ? `${yyyy + 1}-01-01` : `${yyyy}-${String(mm + 1).padStart(2, "0")}-01`;
  return { inicio, finExclusivo, etiqueta: periodo };
}

function soloDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Extrae solo dígitos y separa los últimos 8 como "número", el resto como
 * "punto de venta" — tolera variaciones de formato ("0009-00719112",
 * "9-719112", "0009 00719112") al comparar contra lo que tipeó una persona. */
function normalizarNumeroComprobante(raw: string): string {
  const digitos = soloDigitos(raw);
  if (digitos.length <= 8) return `0-${digitos.padStart(8, "0")}`;
  const numero = digitos.slice(-8);
  const puntoVenta = String(parseInt(digitos.slice(0, -8), 10));
  return `${puntoVenta}-${numero.padStart(8, "0")}`;
}

function clavePuntoVentaNumero(puntoVenta: number, numero: number): string {
  return `${puntoVenta}-${String(numero).padStart(8, "0")}`;
}

type FacturaCargada = {
  fechaEmision: string;
  montoTotal: number | null;
  numeroFactura: string | null;
};

export type EstadoCotejo = "FALTAN_FACTURAS" | "CARGADAS_DE_MAS" | "OK";

export type FilaCotejo = {
  cuit: string;
  nombre: string;
  cantAfip: number;
  montoAfip: number;
  cantCargada: number;
  montoCargado: number;
  estado: EstadoCotejo;
  // Facturas de AFIP que no se encontraron entre las cargadas (ni por número ni
  // por monto+fecha) — las que hay que pedir.
  faltantes: { numero: string; fecha: string; importe: number }[];
  // Facturas identificadas como la misma pese a no tener numero_factura cargado,
  // porque fecha e importe coinciden exacto con un comprobante de AFIP —
  // decisión del usuario (2026-08-19): tratarlas como la misma factura, dejando
  // la observación en vez de contarlas como faltantes.
  identificadasPorMontoYFecha: { numero: string; fecha: string; importe: number }[];
  // Facturas cargadas en el sistema para este proveedor/local/período que no
  // se pudieron emparejar con ningún comprobante de AFIP — posible fecha mal
  // cargada, duplicado, o factura de otro período.
  cargadasSinMatch: { fecha: string; monto: number }[];
};

export type ResultadoCotejo = {
  local: { id: number; nombre: string };
  periodo: string;
  cuitReceptorExcel: string;
  totalComprobantesExcel: number;
  totalFueraDePeriodo: number;
  filas: FilaCotejo[];
  ajustes: { cuit: string; nombre: string; cantidad: number; montoTotal: number }[];
  excluidos: { cuit: string; nombre: string; motivo: MotivoExclusionAfip; cantidad: number; montoTotal: number }[];
  proveedoresSinCuit: string[];
  totales: {
    proveedoresConDiferencia: number;
    proveedoresOk: number;
    comprobantesFaltantes: number;
    montoFaltante: number;
  };
};

export async function resolverLocal(idOnombre: string) {
  const locales = await db.select().from(alqLocales);
  const porId = locales.find((l) => String(l.id) === idOnombre);
  if (porId) return { local: porId, locales };
  const coincidencias = locales.filter((l) => l.nombre.toUpperCase().includes(idOnombre.toUpperCase()));
  return { local: coincidencias.length === 1 ? coincidencias[0] : null, locales, coincidencias };
}

export async function cotejarComprobantesAfip(
  comprobantes: ComprobanteAfip[],
  local: { id: number; nombre: string },
  periodoSolicitado?: string
): Promise<ResultadoCotejo> {
  if (comprobantes.length === 0) throw new ErrorParseoAfip("El excel no tiene filas de datos reconocibles.");

  const cuitsReceptor = new Set(comprobantes.map((c) => c.cuitReceptor));
  if (cuitsReceptor.size > 1) {
    throw new ErrorParseoAfip(
      `El excel mezcla más de un CUIT receptor (${[...cuitsReceptor].join(", ")}) — no parece ser el export de un solo restaurante.`
    );
  }

  const periodo = periodoSolicitado ?? inferirPeriodo(comprobantes);
  const { inicio, finExclusivo } = rangoDePeriodo(periodo);

  const enPeriodo = comprobantes.filter((c) => c.fecha >= inicio && c.fecha < finExclusivo);

  // CUITs marcados como "no es un proveedor de productos" (alquiler, servicio,
  // plataforma de delivery, etc. — ver cpAfipExclusiones en db/schema.ts): se
  // sacan del cotejo antes de calcular nada, para que ni cuenten en las
  // métricas ni aparezcan como "faltan facturas".
  const exclusiones = await obtenerExclusionesAfip();
  const excluidosComprobantes = enPeriodo.filter((c) => exclusiones.has(c.cuitEmisor));
  const sinExcluidos = enPeriodo.filter((c) => !exclusiones.has(c.cuitEmisor));

  const primarios = sinExcluidos.filter((c) => !c.esAjuste);
  const ajustesComprobantes = sinExcluidos.filter((c) => c.esAjuste);

  const afipPorCuit = agruparAfipPorCuit(primarios);
  const ajustesPorCuit = agruparAfipPorCuit(ajustesComprobantes);

  const cargado = await db
    .select({
      nombre: cpProveedores.nombre,
      cuit: cpProveedores.cuit,
      fechaEmision: cpFacturas.fechaEmision,
      montoTotal: cpFacturas.montoTotal,
      numeroFactura: cpFacturas.numeroFactura,
    })
    .from(cpFacturas)
    .innerJoin(cpProveedores, eq(cpFacturas.proveedorId, cpProveedores.id))
    .where(and(eq(cpFacturas.localId, local.id), gte(cpFacturas.fechaEmision, inicio), lt(cpFacturas.fechaEmision, finExclusivo)));

  // cp_proveedores.cuit conviven en dos formatos ("30711901651" y "30-71190165-1")
  // para el mismo proveedor real (dato pendiente de normalizar en el catálogo) —
  // se agrupa por dígitos solos para que ambos formatos caigan en la misma clave.
  const cargadoPorCuit = new Map<string, { nombre: string; comprobantes: FacturaCargada[] }>();
  const proveedoresSinCuit = new Set<string>();
  for (const f of cargado) {
    if (!f.cuit) {
      proveedoresSinCuit.add(f.nombre);
      continue;
    }
    const cuit = soloDigitos(f.cuit);
    const acc = cargadoPorCuit.get(cuit) ?? { nombre: f.nombre, comprobantes: [] };
    acc.comprobantes.push({
      fechaEmision: f.fechaEmision,
      montoTotal: f.montoTotal ? Number(f.montoTotal) : null,
      numeroFactura: f.numeroFactura,
    });
    cargadoPorCuit.set(cuit, acc);
  }

  const todosLosCuits = new Set([...afipPorCuit.keys(), ...cargadoPorCuit.keys()]);
  const filas: FilaCotejo[] = [];

  for (const cuit of todosLosCuits) {
    const afip = afipPorCuit.get(cuit);
    const carg = cargadoPorCuit.get(cuit);
    const afipComprobantes = afip?.comprobantes ?? [];
    const cargados = carg?.comprobantes ?? [];
    const nombre = carg?.nombre ?? afip?.denominacion ?? cuit;

    const { faltantes, identificadasPorMontoYFecha, cargadosSinMatch } = emparejarComprobantes(afipComprobantes, cargados);

    const cantAfip = afipComprobantes.length;
    const cantCargada = cargados.length;
    const montoAfip = afipComprobantes.reduce((acc, c) => acc + c.importeTotal, 0);
    const montoCargado = cargados.reduce((acc, c) => acc + (c.montoTotal ?? 0), 0);

    const estado: EstadoCotejo = faltantes.length > 0 ? "FALTAN_FACTURAS" : cargadosSinMatch.length > 0 ? "CARGADAS_DE_MAS" : "OK";

    filas.push({
      cuit,
      nombre,
      cantAfip,
      montoAfip,
      cantCargada,
      montoCargado,
      estado,
      faltantes: faltantes.map((c) => ({
        numero: `${String(c.puntoVenta).padStart(4, "0")}-${String(c.numero).padStart(8, "0")}`,
        fecha: c.fecha,
        importe: c.importeTotal,
      })),
      identificadasPorMontoYFecha: identificadasPorMontoYFecha.map((c) => ({
        numero: `${String(c.puntoVenta).padStart(4, "0")}-${String(c.numero).padStart(8, "0")}`,
        fecha: c.fecha,
        importe: c.importeTotal,
      })),
      cargadasSinMatch: cargadosSinMatch.map((c) => ({ fecha: c.fechaEmision, monto: c.montoTotal ?? 0 })),
    });
  }

  const orden: Record<EstadoCotejo, number> = { FALTAN_FACTURAS: 0, CARGADAS_DE_MAS: 1, OK: 2 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.cantAfip - a.cantAfip);

  const proveedoresConDiferencia = filas.filter((f) => f.estado !== "OK").length;
  const comprobantesFaltantes = filas.reduce((acc, f) => acc + f.faltantes.length, 0);
  const montoFaltante = filas.reduce((acc, f) => acc + f.faltantes.reduce((a, x) => a + x.importe, 0), 0);

  const excluidosPorCuit = agruparAfipPorCuit(excluidosComprobantes);
  const excluidos = [...excluidosPorCuit.entries()].map(([cuit, a]) => ({
    cuit,
    nombre: a.denominacion,
    motivo: exclusiones.get(cuit) ?? "OTRO",
    cantidad: a.comprobantes.length,
    montoTotal: a.comprobantes.reduce((acc, c) => acc + c.importeTotal, 0),
  }));

  return {
    local,
    periodo,
    cuitReceptorExcel: [...cuitsReceptor][0],
    totalComprobantesExcel: comprobantes.length,
    totalFueraDePeriodo: comprobantes.length - enPeriodo.length,
    filas,
    ajustes: [...ajustesPorCuit.entries()].map(([cuit, a]) => ({
      cuit,
      nombre: a.denominacion,
      cantidad: a.comprobantes.length,
      montoTotal: a.comprobantes.reduce((acc, c) => acc + c.importeTotal, 0),
    })),
    excluidos,
    proveedoresSinCuit: [...proveedoresSinCuit],
    totales: {
      proveedoresConDiferencia,
      proveedoresOk: filas.length - proveedoresConDiferencia,
      comprobantesFaltantes,
      montoFaltante,
    },
  };
}

/** CUITs marcados como "no es un proveedor de productos" — ver cpAfipExclusiones
 * en db/schema.ts. Global (no por restaurante): decisión del usuario (2026-08-19). */
export async function obtenerExclusionesAfip(): Promise<Map<string, MotivoExclusionAfip>> {
  const filas = await db.select({ cuit: cpAfipExclusiones.cuit, motivo: cpAfipExclusiones.motivo }).from(cpAfipExclusiones);
  return new Map(filas.map((f) => [f.cuit, f.motivo as MotivoExclusionAfip]));
}

function agruparAfipPorCuit(comprobantes: ComprobanteAfip[]) {
  const map = new Map<string, { denominacion: string; comprobantes: ComprobanteAfip[] }>();
  for (const c of comprobantes) {
    const acc = map.get(c.cuitEmisor) ?? { denominacion: c.denominacionEmisor, comprobantes: [] };
    acc.comprobantes.push(c);
    map.set(c.cuitEmisor, acc);
  }
  return map;
}

/** Empareja, para UN proveedor, los comprobantes de AFIP contra los cargados en
 * dos pasadas: primero por número de comprobante (exacto, tolerante a formato);
 * lo que no matcheó así pero tiene fecha e importe EXACTOS contra una factura
 * cargada sin número (nunca se pisa un número ya cargado) se considera la misma
 * factura — decisión del usuario, ver comentario en identificadasPorMontoYFecha
 * más arriba. Lo que sigue sin aparecer de un lado o del otro son diferencias
 * reales. */
function emparejarComprobantes(afip: ComprobanteAfip[], cargados: FacturaCargada[]) {
  const restanteAfip = [...afip];
  const restanteCargado = [...cargados];
  const identificadasPorMontoYFecha: ComprobanteAfip[] = [];

  for (let i = restanteAfip.length - 1; i >= 0; i--) {
    const c = restanteAfip[i];
    const clave = clavePuntoVentaNumero(c.puntoVenta, c.numero);
    const idx = restanteCargado.findIndex((f) => f.numeroFactura && normalizarNumeroComprobante(f.numeroFactura) === clave);
    if (idx >= 0) {
      restanteCargado.splice(idx, 1);
      restanteAfip.splice(i, 1);
    }
  }

  for (let i = restanteAfip.length - 1; i >= 0; i--) {
    const c = restanteAfip[i];
    const idx = restanteCargado.findIndex(
      (f) => !f.numeroFactura && f.fechaEmision === c.fecha && f.montoTotal != null && Math.abs(f.montoTotal - c.importeTotal) <= TOLERANCIA_MONTO
    );
    if (idx >= 0) {
      identificadasPorMontoYFecha.push(c);
      restanteCargado.splice(idx, 1);
      restanteAfip.splice(i, 1);
    }
  }

  return { faltantes: restanteAfip, identificadasPorMontoYFecha, cargadosSinMatch: restanteCargado };
}
