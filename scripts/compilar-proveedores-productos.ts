// Compila scripts/.output-proveedores-cbc.json (salida de
// extraer-proveedores-productos-cbc.ts): dedupea por CUIT (o por nombre si no
// hay CUIT), junta en qué restaurantes aparece cada proveedor de PRODUCTO, y
// cruza contra cp_proveedores para marcar cuáles ya están cargados en el
// sistema de control de precios.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import { db } from "../db/index";
import { cpProveedores } from "../db/schema";
import type { ProveedorExtraido } from "./extraer-proveedores-productos-cbc";

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

async function main() {
  const data: ProveedorExtraido[] = JSON.parse(fs.readFileSync("scripts/.output-proveedores-cbc.json", "utf8"));
  // "Vs. Alimentos"/"Vs. Bebidas"/"Varios" son buckets de gasto misceláneo del
  // propio CBC (no una empresa real) — el mismo nombre aparece en cada
  // restaurante con un CUIT distinto o vacío (fórmula desactualizada/celda
  // vecina, no un dato real), así que no son proveedores identificables.
  const esBucket = (nombre: string) => /^vs\.?\s/i.test(nombre.trim()) || nombre.trim().toLowerCase() === "varios";
  const productos = data.filter((p) => p.categoria === "PRODUCTO" && !esBucket(p.nombreCbc));

  type Grupo = {
    nombres: Set<string>;
    cuit: string | null;
    locales: Set<string>;
    cuentas: Set<string>;
    cantidadTotal: number;
  };
  const grupos = new Map<string, Grupo>();

  for (const p of productos) {
    const cuitDigits = p.cuit ? soloDigitos(p.cuit) : null;
    const clave = cuitDigits && cuitDigits.length === 11 ? `cuit:${cuitDigits}` : `nombre:${p.nombreCbc.toLowerCase().trim()}`;
    const g = grupos.get(clave) ?? { nombres: new Set(), cuit: cuitDigits, locales: new Set(), cuentas: new Set(), cantidadTotal: 0 };
    g.nombres.add(p.nombreCbc);
    if (p.razonSocial) g.nombres.add(p.razonSocial);
    g.locales.add(p.local);
    for (const c of p.cuentas) g.cuentas.add(c);
    g.cantidadTotal += p.cantidadCompras;
    grupos.set(clave, g);
  }

  const proveedoresDb = await db.select({ nombre: cpProveedores.nombre, cuit: cpProveedores.cuit }).from(cpProveedores);
  const cuitsCargados = new Set(proveedoresDb.filter((p) => p.cuit).map((p) => soloDigitos(p.cuit!)));

  const filas = [...grupos.entries()]
    .map(([clave, g]) => ({
      clave,
      nombres: [...g.nombres].join(" / "),
      cuit: g.cuit,
      cargadoEnSistema: g.cuit ? cuitsCargados.has(g.cuit) : false,
      locales: [...g.locales].sort(),
      cantidadLocales: g.locales.size,
      cuentas: [...g.cuentas].join(" | "),
      cantidadTotal: g.cantidadTotal,
    }))
    .sort((a, b) => b.cantidadLocales - a.cantidadLocales || a.nombres.localeCompare(b.nombres));

  fs.writeFileSync("scripts/.output-proveedores-compilado.json", JSON.stringify(filas, null, 2));

  console.log(`Proveedores de PRODUCTO únicos: ${filas.length}`);
  console.log(`Con CUIT: ${filas.filter((f) => f.cuit).length} | Sin CUIT: ${filas.filter((f) => !f.cuit).length}`);
  console.log(`Ya cargados en cp_proveedores (por CUIT): ${filas.filter((f) => f.cargadoEnSistema).length}`);
  console.log(`Con CUIT pero NO cargados: ${filas.filter((f) => f.cuit && !f.cargadoEnSistema).length}`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
