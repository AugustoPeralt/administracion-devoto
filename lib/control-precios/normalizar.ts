/**
 * Usado tanto al importar el Excel de 5cynar (cpPreciosReferenciaVerduleria) como al
 * confirmar una factura (buscarOCrearProducto / resolverPrecioVerduleria) — si los
 * dos lados no normalizan exactamente igual, el cruce de precios de VERDULERIA falla
 * en silencio (nunca matchea) en vez de tirar un error visible.
 */
export function normalizarNombreProducto(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** "2026-07-15" -> "2026-07-01". Slicing de texto en vez de Date para no arrastrar
 * corrimientos de zona horaria (new Date("2026-07-15") es UTC medianoche, pero
 * .getMonth() lo lee en zona local y puede devolver junio). */
export function primerDiaDelMes(fechaISO: string): string {
  return `${fechaISO.slice(0, 7)}-01`;
}

/** Normaliza para comparar nombres de proveedores/productos: minúsculas, sin
 * tildes ni puntuación, sin sufijos societarios comunes (S.A., S.R.L., etc.).
 * Usado tanto para sugerir fusiones (ver agruparPosiblesDuplicados en
 * consultas.ts) como para evitar crear un proveedor duplicado al confirmar una
 * factura (ver buscarOCrearProveedor en actions.ts) — comparten la misma
 * heurística para no divergir en qué cuenta como "el mismo nombre". */
export function nombreBaseComercial(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    // Apóstrofos (rectos, tipográficos, o el acento agudo suelto que a veces se
    // lee en su lugar) — junto con cualquier espacio pegado, para que "Hellmann's",
    // "Hellmann 's" y "Hellmann´s" converjan al mismo texto base. Caso real: tres
    // facturas de un mismo producto quedaron como "productos distintos" en el
    // panel de duplicados solo por esto.
    .replace(/\s*['´’‘`]\s*/g, "")
    .replace(/\b(s\s*a\s*c\s*i\s*f|s\s*a\s*i\s*c|s\s*r\s*l|s\s*a|hnos?|hermanos)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** true si dos nombres son "el mismo" a los fines de detectar duplicados: sus
 * nombres base (ver nombreBaseComercial) tienen 3+ caracteres y uno contiene al
 * otro. Es una pista, no una prueba — la decisión final la toma una persona. */
export function sonNombresSimilares(a: string, b: string): boolean {
  const baseA = nombreBaseComercial(a);
  const baseB = nombreBaseComercial(b);
  if (baseA.length < 3 || baseB.length < 3) return false;
  return baseA.includes(baseB) || baseB.includes(baseA);
}

/**
 * Valida el dígito verificador de un CUIT argentino (algoritmo módulo 11 de
 * AFIP). Tolerante a guiones/espacios en la entrada. No confirma que el CUIT
 * exista de verdad (para eso haría falta consultar a AFIP) — solo descarta los
 * que son matemáticamente imposibles, que es exactamente el tipo de error que
 * comete la IA al leer mal un dígito de una foto (ver buscarOCrearProveedor:
 * un CUIT inválido se trata como si no se hubiera leído ningún CUIT).
 */
export function esCuitValido(cuit: string): boolean {
  const digitos = cuit.replace(/\D/g, "");
  if (digitos.length !== 11) return false;

  const numeros = digitos.split("").map(Number);
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * numeros[i], 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  if (verificador === 10) return false; // no existe dígito verificador válido

  return verificador === numeros[10];
}
