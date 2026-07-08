/**
 * Corre lib/alquileres/{cbc-parser,contratos-parser,alertas}.ts contra los mismos
 * fixtures reales que contratoAlquileres/scripts/gen_preview_json.py y diffea el
 * resultado campo a campo. Requiere haber corrido antes:
 *   cd ../contratoAlquileres/contratoAlquileres && .venv/Scripts/python.exe scripts/gen_preview_json.py
 *
 * Ver plan de migración (Fase 2): no se avanza a integrar el parser TS hasta que
 * este diff sea limpio.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { extraerAlquileres } from "../lib/alquileres/cbc-parser";
import { cargarMaestro } from "../lib/alquileres/contratos-parser";
import { calcularAlertas } from "../lib/alquileres/alertas";
import type { CanonVigenteConfig } from "../lib/alquileres/tipos";

const REPO_PY = path.resolve(__dirname, "../../contratoAlquileres/contratoAlquileres");
const FIXTURES = path.join(REPO_PY, "tests/fixtures");
const CBC_PATH = path.join(FIXTURES, "CBC_1er_Semestre_2026_LUCA.xlsm");
const MASTER_PATH = path.join(FIXTURES, "PLAZO_DE_CONTRATOS_DE_LOCACION_-_GASTRONOMICOS.xlsx");
const MAPPING_PATH = path.join(REPO_PY, "config/locales_mapping.json");
const PYTHON_JSON = path.join(FIXTURES, "parity_python_output.json");
const TS_JSON = path.join(FIXTURES, "parity_ts_output.json");

// Mismo HOY que contratoAlquileres/scripts/gen_preview_json.py (2026-06-19 UTC).
const HOY = new Date(Date.UTC(2026, 5, 19));

const CANON_SINTETICO: CanonVigenteConfig = {
  ENCISO: {
    diaPagoDesde: 1,
    diaPagoHasta: 10,
    proximoAjuste: "2026-06-25",
    indiceAjuste: "ICC",
    preavisoProrrogaDias: 30,
  },
  "ROMA CON AMOR": {
    diaPagoDesde: 1,
    diaPagoHasta: 5,
    proximoAjuste: null,
    indiceAjuste: null,
    preavisoProrrogaDias: 45,
  },
};

async function generarSalidaTs() {
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf-8")) as Record<string, string>;

  const { alquileres, unmapped } = await extraerAlquileres(
    readFileSync(CBC_PATH),
    mapping,
    path.basename(CBC_PATH)
  );
  const contratos = await cargarMaestro(readFileSync(MASTER_PATH));

  const alertasCanonVacio = calcularAlertas(contratos, alquileres, {}, HOY);
  const alertasCanonSintetico = calcularAlertas(contratos, alquileres, CANON_SINTETICO, HOY);

  console.log(`      -> ${alquileres.length} alquileres, ${Object.keys(contratos).length} locales con contratos`);
  console.log(
    `      -> ${alertasCanonVacio.length} alertas (canon vacío), ${alertasCanonSintetico.length} alertas (canon sintético)`
  );

  return {
    alquileres,
    unmapped: [...unmapped].sort(),
    contratos,
    alertasCanonVacio,
    alertasCanonSintetico,
  };
}

// ── Diff con tolerancia numérica ─────────────────────────────────────────────

const TOLERANCIA = 0.01;

interface Discrepancia {
  ruta: string;
  python: unknown;
  ts: unknown;
}

function diff(ruta: string, py: unknown, ts: unknown, out: Discrepancia[]): void {
  if (typeof py === "number" && typeof ts === "number") {
    if (Math.abs(py - ts) > TOLERANCIA) out.push({ ruta, python: py, ts });
    return;
  }
  if (py === null || ts === null || py === undefined || ts === undefined) {
    if (py !== ts) out.push({ ruta, python: py, ts });
    return;
  }
  if (Array.isArray(py) || Array.isArray(ts)) {
    if (!Array.isArray(py) || !Array.isArray(ts)) {
      out.push({ ruta, python: py, ts });
      return;
    }
    if (py.length !== ts.length) {
      out.push({ ruta: `${ruta}.length`, python: py.length, ts: ts.length });
    }
    const n = Math.max(py.length, ts.length);
    for (let i = 0; i < n; i++) {
      diff(`${ruta}[${i}]`, py[i], ts[i], out);
    }
    return;
  }
  if (typeof py === "object" && typeof ts === "object") {
    const claves = new Set([...Object.keys(py), ...Object.keys(ts)]);
    for (const clave of claves) {
      diff(
        ruta ? `${ruta}.${clave}` : clave,
        (py as Record<string, unknown>)[clave],
        (ts as Record<string, unknown>)[clave],
        out
      );
    }
    return;
  }
  if (py !== ts) out.push({ ruta, python: py, ts });
}

async function main() {
  console.log("[1/2] Corriendo parsers TypeScript sobre los fixtures reales...");
  const salidaTs = await generarSalidaTs();
  writeFileSync(TS_JSON, JSON.stringify(salidaTs, null, 2), "utf-8");
  console.log(`      Volcado guardado: ${TS_JSON}`);

  if (!existsSync(PYTHON_JSON)) {
    console.log(
      `\n[2/2] No se encontró ${PYTHON_JSON}.\n` +
        "      Corré primero (del lado Python, sin tocar src/):\n" +
        "        cd ../contratoAlquileres/contratoAlquileres\n" +
        "        .venv/Scripts/python.exe scripts/gen_preview_json.py\n"
    );
    process.exit(1);
  }

  console.log("\n[2/2] Diffeando contra la salida Python...");
  const salidaPy = JSON.parse(readFileSync(PYTHON_JSON, "utf-8"));

  const discrepancias: Discrepancia[] = [];
  diff("", salidaPy, salidaTs, discrepancias);

  if (discrepancias.length === 0) {
    console.log("\n✓ Diff limpio — paridad Python/TypeScript confirmada.");
    return;
  }

  console.log(`\n✗ ${discrepancias.length} discrepancia(s):\n`);
  for (const d of discrepancias.slice(0, 50)) {
    console.log(`  ${d.ruta}`);
    console.log(`    python: ${JSON.stringify(d.python)}`);
    console.log(`    ts:     ${JSON.stringify(d.ts)}`);
  }
  if (discrepancias.length > 50) {
    console.log(`  ... y ${discrepancias.length - 50} más.`);
  }
  process.exit(1);
}

main();
