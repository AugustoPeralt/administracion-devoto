/**
 * Una palabra clave normal matchea por substring (ej. "FERRETERIA" matchea "alquiler
 * mes de junio ferreteria"). Una palabra clave que empieza con "=" exige coincidencia
 * EXACTA con descripcion_final o concepto_manual — necesario cuando el texto corto es
 * substring de otro (ej. "ALQUILER TAVLON" es substring de "ALQUILER TAVLON
 * ferreteria"; sin el modo exacto, matchear por substring le robaría esa fila a
 * FERRETERIA). Se compara descripcion_final y concepto_manual por separado, no
 * concatenados, porque en la práctica casi siempre tienen el mismo valor duplicado.
 */
export function coincideKeyword(keywordCruda: string, descripcion: string, conceptoManual: string | null): boolean {
  const desc = descripcion.trim().toLowerCase();
  const conc = (conceptoManual ?? "").trim().toLowerCase();

  if (keywordCruda.startsWith("=")) {
    const exacto = keywordCruda.slice(1).trim().toLowerCase();
    if (!exacto) return false;
    return desc === exacto || conc === exacto;
  }

  const kw = keywordCruda.trim().toLowerCase();
  if (!kw) return false;
  return desc.includes(kw) || conc.includes(kw);
}

/** Parsea "kw1, kw2, =kw3" en una lista de keywords sin vacíos. */
export function parsearPalabrasClave(palabrasClave: string | null): string[] {
  return (palabrasClave ?? "").split(",").map((k) => k.trim()).filter(Boolean);
}
