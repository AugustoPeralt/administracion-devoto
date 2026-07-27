/**
 * Genera sugerencias de emparejado Criollo↔Emporio (confirmado=false) para las
 * filas que no quedaron en scripts/confirmar-pares-criollo-emporio.ts —
 * heurística de solapamiento de palabras (Jaccard) + tamaño detectado en el
 * texto, la misma que se usó para separar "alta confianza" (ya confirmados a
 * mano) de "sospechoso" (2026-07-23). Cada sugerencia queda con un `motivo`
 * explicando por qué no se confirmó sola, para que la persona que la revise en
 * /control-precios/comparacion no tenga que adivinar. No vuelve a sugerir para
 * filas que ya tienen un par CONFIRMADO. Idempotente por índice único —
 * correrlo de nuevo no duplica sugerencias ya existentes.
 *
 * Uso: npx tsx scripts/generar-sugerencias-criollo-emporio.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db";
import { cpListasPreciosProveedor, cpParesPreciosProveedores } from "../db/schema";
import { eq } from "drizzle-orm";

const CRIOLLO_ID = 8;
const EMPORIO_ID = 29;

const STOPWORDS = new Set([
  "X","DE","CON","SIN","LA","EL","LOS","LAS","Y","A","EN","PARA","POR","AL","O",
  "TACC","GLUTEN","S","C","UN","UNA","KG","KGS","GR","GRS","LT","LTS","CC","ML","U",
  "UNID","UNIDAD","UNIDADES","PACK","CAJA","BOLSA","BARRA","BOTELLA","FRASCO","POTE",
]);

function normalizar(s: string): string {
  return s
    .toString()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 .,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extraerTamanios(texto: string): string[] {
  const regex = /(\d+(?:[.,]\d+)?)\s*(LT|KG|GR|CC|ML|GRS|KGS)\b/g;
  const tamanios: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texto))) {
    const num = m[1].replace(",", ".");
    let unidad = m[2];
    if (unidad === "GRS") unidad = "GR";
    if (unidad === "KGS") unidad = "KG";
    if (unidad === "CC") unidad = "ML";
    tamanios.push(`${parseFloat(num)}${unidad}`);
  }
  return tamanios;
}

function tokens(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && Number.isNaN(Number(t)))
  );
}

type Row = { id: number; descripcion: string; presentacion: string | null };

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let interseccion = 0;
  for (const t of a) if (b.has(t)) interseccion++;
  return interseccion / (a.size + b.size - interseccion);
}

async function main() {
  const criollo = (await db.select().from(cpListasPreciosProveedor).where(eq(cpListasPreciosProveedor.proveedorId, CRIOLLO_ID))) as Row[];
  const emporio = (await db.select().from(cpListasPreciosProveedor).where(eq(cpListasPreciosProveedor.proveedorId, EMPORIO_ID))) as Row[];

  // Filas que ya tienen un par CONFIRMADO — no se les vuelve a sugerir nada.
  const paresConfirmados = await db
    .select()
    .from(cpParesPreciosProveedores)
    .where(eq(cpParesPreciosProveedores.confirmado, true));
  const yaConfirmada = new Set<number>();
  for (const p of paresConfirmados) {
    yaConfirmada.add(p.listaAId);
    yaConfirmada.add(p.listaBId);
  }

  const criolloFeat = criollo
    .filter((r) => !yaConfirmada.has(r.id))
    .map((r) => ({ row: r, tokens: tokens(r.descripcion), tamanios: new Set(extraerTamanios(r.descripcion + " " + (r.presentacion ?? ""))) }));
  const emporioFeat = emporio
    .filter((r) => !yaConfirmada.has(r.id))
    .map((r) => ({ row: r, tokens: tokens(r.descripcion), tamanios: new Set(extraerTamanios(r.descripcion + " " + (r.presentacion ?? ""))) }));

  let insertadas = 0;
  let saltadasPorConflicto = 0;

  for (const cf of criolloFeat) {
    const candidatos: { ef: (typeof emporioFeat)[number]; score: number; mismoTamanio: boolean }[] = [];
    for (const ef of emporioFeat) {
      const score = jaccard(cf.tokens, ef.tokens);
      if (score <= 0) continue;
      let mismoTamanio = cf.tamanios.size === 0 || ef.tamanios.size === 0;
      for (const t of cf.tamanios) if (ef.tamanios.has(t)) mismoTamanio = true;
      candidatos.push({ ef, score, mismoTamanio });
    }
    candidatos.sort((a, b) => b.score - a.score);
    if (candidatos.length === 0) continue;

    const mejor = candidatos[0];
    const segundo = candidatos[1];
    const margen = segundo ? mejor.score - segundo.score : mejor.score;

    // Mismo corte que el análisis manual previo: alta confianza (ya se
    // confirmaron a mano) vs. el resto, que va como sugerencia pendiente.
    const altaConfianza = mejor.score >= 0.5 && margen >= 0.15 && mejor.mismoTamanio;
    if (altaConfianza || mejor.score < 0.3) continue; // ya confirmado antes, o demasiado débil para sugerir

    let motivo = "Similitud parcial en el texto — revisar si es el mismo producto.";
    if (!mejor.mismoTamanio) motivo = "Mismo texto pero el tamaño/presentación no coincide claramente.";
    else if (margen < 0.15) motivo = `Compite con otro candidato casi igual de parecido (ej. "${segundo?.ef.row.descripcion}").`;

    try {
      await db.insert(cpParesPreciosProveedores).values({
        listaAId: cf.row.id,
        listaBId: mejor.ef.row.id,
        confirmado: false,
        motivo,
      });
      insertadas++;
    } catch {
      saltadasPorConflicto++;
    }
  }

  console.log(`Sugerencias insertadas: ${insertadas}`);
  console.log(`Saltadas por conflicto de índice (ya existía ese par): ${saltadasPorConflicto}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
