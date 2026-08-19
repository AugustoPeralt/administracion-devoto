// Extrae, de la hoja "CtasCtes" de cada CBC, los proveedores que tienen compras
// reales registradas contra una cuenta contable de PRODUCTO (alimentos, bebidas,
// descartables, limpieza, etc.) — a diferencia de la hoja "Titulares" (que mezcla
// alquileres/servicios/empleados sin clasificar en su mayoría, ver conversación
// 2026-08-19), la cuenta contable usada en cada "Compra"/"Comp/Pago" real es la
// fuente confiable: es lo que el propio contable del restaurante tipeó al cargar
// cada comprobante, no un campo de catálogo que puede estar vacío.
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { obtenerSiteId, obtenerDriveIdPrincipal } from "../lib/sharepoint";
import { graphFetch } from "../lib/graph";
import { textoOr, numeroOr0 } from "../lib/alquileres/excel-helpers";

const COL_PROVEEDOR = 9; // I
const COL_CUENTA = 12; // L
const COL_TIPO_MOV = 17; // Q
const COL_RAZON_SOC = 28; // AB
const COL_CUIT = 29; // AC
const COL_TOTAL_COMPRA = 40; // AN

const CACHE_DIR = process.argv.includes("--no-cache") ? null : "C:/Users/Usuario/AppData/Local/Temp/claude-cbc-cache";

type EmpresaCbc = { local: string; carpeta: string; archivo: string };

const EMPRESAS: EmpresaCbc[] = [
  { local: "BETULAR PALERMO", carpeta: "Contabilidades MITRE 480 SA/CBC", archivo: "CBC_Betular_Palermo_1erS2024.xlsm" },
  { local: "TAVLON", carpeta: "Contabilidades ENTREVIAS/CBC", archivo: "CBC_2S_2026_Tavlon1.xlsm" },
  { local: "ROMA CON AMOR", carpeta: "Contabilidades ROMA CON AMOR/CBC", archivo: "CBC_2do_S_2026_Pepe di Roma.xlsm" },
  { local: "ENCISO", carpeta: "Contabilidades ENCISO/CBC", archivo: "CBC_2do_Semestre_2026_Casa Luca.xlsm" },
  { local: "ESMERALDA ZONA NORTE", carpeta: "Contabilidades ESMERALDA/CBC", archivo: "CBC_2do_2026_Seis.xlsm" },
  { local: "MACARONS", carpeta: "Contabilidades MACARONS/CBC ACTUAL", archivo: "CBC_2doS_2026_Macarons.xlsm" },
  { local: "MECHA", carpeta: "Contabilidades MERCEDES/CBC", archivo: "CBC_MECHA_1erS_2026.xlsm" },
  { local: "PIANTE", carpeta: "Contabilidades PIANTE SRL", archivo: "CBC_1er_2026_Benito_.xlsm" },
  { local: "MLCD", carpeta: "Contabilidades MLCD/CBC ACTUAL", archivo: "CBC_2doS_2026_Alicia.xlsm" },
];

// Clasificación por palabra clave de la cuenta contable — ver muestra real
// (Roma con Amor, conversación 2026-08-19) para el vocabulario. "PRODUCTO" es la
// única categoría que interesa; el resto se descarta del reporte final pero se
// deja clasificado por si hace falta auditar.
function clasificarCuenta(cuenta: string): "PRODUCTO" | "ALQUILER" | "SERVICIO" | "OTRO" {
  const c = cuenta.toLowerCase();
  if (/alquil/.test(c)) return "ALQUILER";
  if (
    /aliment|bebida|descart|servill|packaging|caf[eé]|t[eé],|infusion|hielo|vajilla|uten|limpieza|verduler|carne|pescad|avicola|harina|queso|fiambre|panific|helado|huevo|golosina|insumo/.test(
      c
    )
  )
    return "PRODUCTO";
  if (
    /honorari|software|sistema|telefon|energia|plaga|lavader|dise[ñn]o|alarma|public|web|contable|jur[ií]dico|arquitect|repar|mantenimient|seguridad|internet|abl\b|servicio/.test(
      c
    )
  )
    return "SERVICIO";
  return "OTRO";
}

async function descargarCbc(empresa: EmpresaCbc): Promise<Buffer> {
  const cachePath = CACHE_DIR ? path.join(CACHE_DIR, `${empresa.local.replace(/\s+/g, "_")}.xlsm`) : null;
  if (cachePath && fs.existsSync(cachePath)) {
    console.error(`  (usando cache: ${cachePath})`);
    return fs.readFileSync(cachePath);
  }
  const siteId = await obtenerSiteId();
  const driveId = await obtenerDriveIdPrincipal(siteId);
  const ruta = `CONTABILIDADES/${empresa.carpeta}/${empresa.archivo}`;
  const resp = await graphFetch(`/drives/${driveId}/root:/${ruta.split("/").map(encodeURIComponent).join("/")}:/content`);
  if (!resp.ok) throw new Error(`No se pudo descargar "${ruta}": ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (cachePath) {
    fs.mkdirSync(CACHE_DIR!, { recursive: true });
    fs.writeFileSync(cachePath, buffer);
  }
  return buffer;
}

export type ProveedorExtraido = {
  local: string;
  nombreCbc: string;
  razonSocial: string | null;
  cuit: string | null;
  cuentas: string[];
  categoria: "PRODUCTO" | "ALQUILER" | "SERVICIO" | "OTRO";
  cantidadCompras: number;
  montoTotal: number;
};

async function extraerDeEmpresa(empresa: EmpresaCbc): Promise<ProveedorExtraido[]> {
  console.error(`Procesando ${empresa.local}...`);
  const buffer = await descargarCbc(empresa);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const sheet = wb.getWorksheet("CtasCtes");
  if (!sheet) {
    console.error(`  ⚠ ${empresa.local}: no tiene hoja CtasCtes`);
    return [];
  }

  const porProveedor = new Map<
    string,
    { cuentas: Set<string>; cuits: Set<string>; razonesSociales: Set<string>; cantidad: number; monto: number }
  >();

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const tipoMov = textoOr(row.getCell(COL_TIPO_MOV).value);
    if (tipoMov !== "Compra" && tipoMov !== "Comp/Pago") continue;
    const proveedor = textoOr(row.getCell(COL_PROVEEDOR).value).trim();
    if (!proveedor || proveedor === "Varios") continue;
    const cuenta = textoOr(row.getCell(COL_CUENTA).value).trim();
    if (!cuenta) continue;
    const cuit = textoOr(row.getCell(COL_CUIT).value).trim();
    const razonSocial = textoOr(row.getCell(COL_RAZON_SOC).value).trim();
    const monto = Math.abs(numeroOr0(row.getCell(COL_TOTAL_COMPRA).value));

    const acc = porProveedor.get(proveedor) ?? {
      cuentas: new Set<string>(),
      cuits: new Set<string>(),
      razonesSociales: new Set<string>(),
      cantidad: 0,
      monto: 0,
    };
    acc.cuentas.add(cuenta);
    if (cuit) acc.cuits.add(cuit);
    if (razonSocial) acc.razonesSociales.add(razonSocial);
    acc.cantidad++;
    acc.monto += monto;
    porProveedor.set(proveedor, acc);
  }

  const resultado: ProveedorExtraido[] = [];
  for (const [nombreCbc, acc] of porProveedor) {
    const cuentas = [...acc.cuentas];
    // Un proveedor puede tener compras contra más de una cuenta — se clasifica
    // PRODUCTO si ALGUNA de sus cuentas es de producto (ej. un proveedor que
    // también vendió una vez "Repo.Vajilla y Uten." sigue siendo proveedor de
    // productos, no se pierde por tener una cuenta secundaria distinta).
    const categorias = cuentas.map(clasificarCuenta);
    const categoria = categorias.includes("PRODUCTO")
      ? "PRODUCTO"
      : categorias.includes("ALQUILER")
        ? "ALQUILER"
        : categorias.includes("SERVICIO")
          ? "SERVICIO"
          : "OTRO";

    resultado.push({
      local: empresa.local,
      nombreCbc,
      razonSocial: acc.razonesSociales.size > 0 ? [...acc.razonesSociales][0] : null,
      cuit: acc.cuits.size > 0 ? [...acc.cuits][0] : null,
      cuentas,
      categoria,
      cantidadCompras: acc.cantidad,
      montoTotal: acc.monto,
    });
  }
  return resultado;
}

async function main() {
  const soloLocal = process.argv.find((a) => a.startsWith("--local="))?.split("=")[1];
  const empresas = soloLocal ? EMPRESAS.filter((e) => e.local === soloLocal) : EMPRESAS;
  if (soloLocal && empresas.length === 0) {
    console.error(`No se encontró "${soloLocal}". Válidos: ${EMPRESAS.map((e) => e.local).join(", ")}`);
    process.exit(1);
  }

  const todos: ProveedorExtraido[] = [];
  for (const empresa of empresas) {
    try {
      const extraidos = await extraerDeEmpresa(empresa);
      todos.push(...extraidos);
      console.error(`  ${empresa.local}: ${extraidos.length} proveedores con compras reales`);
    } catch (err) {
      console.error(`  ⚠ ${empresa.local}: ERROR - ${err instanceof Error ? err.message : err}`);
    }
  }

  const outPath = "scripts/.output-proveedores-cbc.json";
  fs.writeFileSync(outPath, JSON.stringify(todos, null, 2));
  console.error(`\nGuardado: ${outPath} (${todos.length} filas totales)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
