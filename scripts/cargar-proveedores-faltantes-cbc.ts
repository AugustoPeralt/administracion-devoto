// Carga en cp_proveedores los proveedores de producto detectados en los CBC
// (ver extraer-proveedores-productos-cbc.ts / compilar-proveedores-productos.ts)
// que todavía no estaban en el sistema — con CUIT cuando se pudo identificar,
// solo con el nombre cuando no. Usa buscarOCrearProveedor() (la misma función
// que usa la carga de facturas real) para no crear duplicados de un proveedor
// que ya existe sin CUIT bajo un nombre parecido — matchea por nombre y le
// completa el CUIT si le faltaba, en vez de insertar una fila nueva.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import { buscarOCrearProveedor, type CategoriaInsumo } from "../app/control-precios/actions";
import { db } from "../db/index";
import { cpProveedores } from "../db/schema";
import { sql } from "drizzle-orm";

type Compilado = {
  clave: string;
  nombres: string;
  cuit: string | null;
  cargadoEnSistema: boolean;
  locales: string[];
  cantidadLocales: number;
  cuentas: string;
  cantidadTotal: number;
};

function elegirNombrePrincipal(nombres: string[]): string {
  const conForma = nombres.filter((n) => /\b(s\.?r\.?l\.?|s\.?a\.?|sociedad)\b/i.test(n));
  const candidatos = conForma.length > 0 ? conForma : nombres;
  return candidatos.reduce((mejor, n) => (n.length > mejor.length ? n : mejor), candidatos[0]);
}

// Las cuentas contables del CBC no mapean 1 a 1 a CATEGORIAS_INSUMO (que es el
// vocabulario de control-precios, pensado para catalogar productos ya
// cargados) — se infiere lo más específico posible y todo lo que no matchea
// una categoría puntual (vajilla, insumos de oficina, café/te, etc.) cae en
// ALMACEN como default, igual criterio que los proveedores sin CUIT ya
// cargados a mano en el sistema (ej. "CID FOOD" categoria VERDULERIA, "Limpieza
// Ya" categoria DESCARTABLES).
function inferirCategoria(cuentas: string): CategoriaInsumo {
  const c = cuentas.toLowerCase();
  if (/carnes/.test(c)) return "CARNE";
  if (/verduler|frutas/.test(c)) return "VERDULERIA";
  if (/bebidas/.test(c)) return "BEBIBLES";
  if (/descart|servill|packaging|individuales|bolsas|limpieza|sorbetes/.test(c)) return "DESCARTABLES";
  return "ALMACEN";
}

async function main() {
  const data: Compilado[] = JSON.parse(fs.readFileSync("scripts/.output-proveedores-compilado.json", "utf8"));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limite = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const faltantes = data.filter((d) => !d.cargadoEnSistema).slice(0, limite);

  console.log(`Proveedores a cargar (no estaban en cp_proveedores): ${faltantes.length}\n`);

  // buscarOCrearProveedor() no distingue en su respuesta "inserté una fila
  // nueva" de "reusé una que ya matcheaba por nombre" salvo en el caso de
  // colisión con CUIT propio (posibleDuplicado) — para saber cuál pasó de
  // verdad, se compara el id devuelto contra el máximo id que ya existía
  // antes de arrancar (los id son seriales crecientes, no hay escritura
  // concurrente durante este script).
  const [{ maxId }] = await db.select({ maxId: sql<number>`coalesce(max(id), 0)` }).from(cpProveedores);
  const maxIdInicial = maxId;

  let creados = 0;
  let matcheadosPorNombre = 0;
  const posiblesDuplicados: { nombre: string; existente: string }[] = [];
  const matcheados: { nombre: string; id: number }[] = [];

  for (const f of faltantes) {
    const nombres = f.nombres.split(" / ").map((n) => n.trim());
    const nombre = elegirNombrePrincipal(nombres);
    const categoria = inferirCategoria(f.cuentas);

    const res = await buscarOCrearProveedor({ nombre, cuit: f.cuit, categoria });
    const esNuevo = res.id > maxIdInicial;

    if (res.posibleDuplicado) {
      posiblesDuplicados.push({ nombre, existente: res.posibleDuplicado });
      console.log(`! "${nombre}" -> id ${res.id} nuevo, pero choca en nombre con "${res.posibleDuplicado}" (distinto CUIT) — revisar`);
      creados++;
    } else if (esNuevo) {
      creados++;
      console.log(`+ "${nombre}" (${categoria}${f.cuit ? `, CUIT ${f.cuit}` : ", sin CUIT"}) -> id ${res.id}`);
    } else {
      matcheadosPorNombre++;
      matcheados.push({ nombre, id: res.id });
      console.log(`~ "${nombre}" ya existía (id ${res.id}) — matcheado por nombre, no se creó fila nueva`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Filas nuevas creadas en cp_proveedores: ${creados}`);
  console.log(`Ya existían (matcheados por nombre, sin fila nueva): ${matcheadosPorNombre}`);
  if (matcheados.length > 0) {
    console.log(`\nMatcheados (no se creó fila nueva):`);
    for (const m of matcheados) console.log(`  "${m.nombre}" -> id ${m.id}`);
  }
  if (posiblesDuplicados.length > 0) {
    console.log(`\n⚠ Choques de nombre con CUIT distinto — revisar en /control-precios/proveedores:`);
    for (const d of posiblesDuplicados) console.log(`  "${d.nombre}" <-> "${d.existente}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
