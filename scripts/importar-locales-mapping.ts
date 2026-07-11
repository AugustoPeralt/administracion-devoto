import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { alqLocalesMapping } from "../db/schema";
import { sql } from "drizzle-orm";

/**
 * Importa (upsert) config/locales_mapping.json a la tabla alqLocalesMapping —
 * reemplazo de esa tabla estática por el JSON real que ya usa el sistema Python
 * (proveedor tal como aparece en el CBC → local canónico). Uso:
 *   npx tsx scripts/importar-locales-mapping.ts [ruta-al-json]
 * Sin argumento, busca en archivosAlquileres/locales_mapping.json (gitignored,
 * copiá ahí el archivo real desde contratoAlquileres/config/locales_mapping.json).
 */
async function main() {
  const rutaJson =
    process.argv[2] ??
    process.env.ALQ_LOCALES_MAPPING_PATH ??
    path.join(process.cwd(), "archivosAlquileres", "locales_mapping.json");

  if (!fs.existsSync(rutaJson)) {
    console.error(`No se encontró ${rutaJson}. Copiá ahí locales_mapping.json o pasá la ruta como argumento.`);
    process.exit(1);
  }

  const mapping = JSON.parse(fs.readFileSync(rutaJson, "utf-8")) as Record<string, string>;
  const entradas = Object.entries(mapping);

  for (const [proveedorCbc, localCanonico] of entradas) {
    await db
      .insert(alqLocalesMapping)
      .values({ proveedorCbc, localCanonico })
      .onConflictDoUpdate({
        target: alqLocalesMapping.proveedorCbc,
        set: { localCanonico: sql`excluded.local_canonico`, activo: true },
      });
  }

  console.log(`Importadas ${entradas.length} entradas de ${rutaJson} a alq_locales_mapping.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
