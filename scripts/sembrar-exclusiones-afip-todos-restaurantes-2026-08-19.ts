// Extiende cp_afip_exclusiones a los 9 restaurantes activos (la carga anterior,
// 2026-08-19, solo tenía los ~23 CUITs identificados a mano en Pepe di Roma —
// por eso Mecha seguía mostrando sus propios alquileres/servicios como si no
// estuvieran excluidos: nunca habían sido agregados). Usa la misma fuente
// confiable que ya sirvió para el censo de proveedores de producto: la cuenta
// contable real de cada compra en la hoja CtasCtes de cada CBC — acá se toma
// lo opuesto (ALQUILER/SERVICIO/OTRO en vez de PRODUCTO).
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import { db } from "../db/index";
import { cpAfipExclusiones } from "../db/schema";
import type { ProveedorExtraido } from "./extraer-proveedores-productos-cbc";

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

const esBucket = (nombre: string) => /^vs\.?\s/i.test(nombre.trim()) || nombre.trim().toLowerCase() === "varios";

function elegirNombrePrincipal(nombres: string[]): string {
  const conForma = nombres.filter((n) => /\b(s\.?r\.?l\.?|s\.?a\.?|sociedad)\b/i.test(n));
  const candidatos = conForma.length > 0 ? conForma : nombres;
  return candidatos.reduce((mejor, n) => (n.length > mejor.length ? n : mejor), candidatos[0]);
}

async function main() {
  const data: ProveedorExtraido[] = JSON.parse(fs.readFileSync("scripts/.output-proveedores-cbc.json", "utf8"));
  const noProducto = data.filter((p) => p.categoria !== "PRODUCTO" && p.cuit && !esBucket(p.nombreCbc));

  const grupos = new Map<string, { nombres: Set<string>; motivo: "ALQUILER" | "SERVICIO" | "OTRO"; locales: Set<string> }>();
  for (const p of noProducto) {
    const cuit = soloDigitos(p.cuit!);
    if (cuit.length !== 11) continue;
    const g = grupos.get(cuit) ?? { nombres: new Set(), motivo: p.categoria as "ALQUILER" | "SERVICIO" | "OTRO", locales: new Set() };
    g.nombres.add(p.nombreCbc);
    if (p.razonSocial) g.nombres.add(p.razonSocial);
    g.locales.add(p.local);
    // Si aparece con categorías distintas en restaurantes distintos, prioriza
    // ALQUILER > SERVICIO > OTRO (la más específica/útil de mostrar).
    const prioridad = { ALQUILER: 0, SERVICIO: 1, OTRO: 2 };
    if (prioridad[p.categoria as "ALQUILER" | "SERVICIO" | "OTRO"] < prioridad[g.motivo]) g.motivo = p.categoria as "ALQUILER" | "SERVICIO" | "OTRO";
    grupos.set(cuit, g);
  }

  console.log(`CUITs no-producto únicos a excluir: ${grupos.size}`);

  const yaExcluidos = await db.select({ cuit: cpAfipExclusiones.cuit }).from(cpAfipExclusiones);
  const yaExcluidosSet = new Set(yaExcluidos.map((e) => soloDigitos(e.cuit)));

  let nuevos = 0;
  let yaEstaban = 0;
  for (const [cuit, g] of grupos) {
    const nombre = elegirNombrePrincipal([...g.nombres]);
    const yaEstaba = yaExcluidosSet.has(cuit);
    await db
      .insert(cpAfipExclusiones)
      .values({ cuit, nombre, motivo: g.motivo })
      .onConflictDoUpdate({ target: cpAfipExclusiones.cuit, set: { nombre, motivo: g.motivo } });
    if (yaEstaba) {
      yaEstaban++;
    } else {
      nuevos++;
      console.log(`+ ${cuit} ${g.motivo.padEnd(9)} "${nombre}" (${[...g.locales].join(", ")})`);
    }
  }

  console.log(`\n${nuevos} exclusiones nuevas, ${yaEstaban} ya existían (actualizado nombre/motivo si cambió).`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
