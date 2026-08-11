/**
 * Usado al confirmar una factura (buscarOCrearProducto) y al comparar ítems entre
 * facturas (obtenerFacturasPosibleDuplicado) — normaliza acentos/mayúsculas/
 * espacios para que la misma descripción de producto, leída dos veces con
 * variantes menores, matchee siempre igual.
 */
export function normalizarNombreProducto(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Los productos IMPORTADOS (café, tomate italiano) a veces traen en la
 * factura un código de lote/origen pegado al final de la descripción, que la
 * IA lee en algunas fotos y en otras no (ej. "...X 1 KG ITALIA 25 001 IC04
 * 042117 J Origen:ITALIA" vs "...X 1 KG ITALIA" a secas) — sin limpiarlo, el
 * mismo producto real queda partido en 3-4 "productos" con nombre distinto
 * (cp_productos.nombre es único por proveedor) y ningún ranking de compras lo
 * detecta como el mismo. Usado por obtenerTop20MasCompradosCriolloEmporio()
 * para agrupar antes de rankear por gasto — no toca cp_productos.nombre en
 * sí, solo agrupa en memoria.
 */
export function limpiarCodigoLoteFactura(nombre: string): string {
  return nombre.replace(/\s+\d{2}[.\s]\d{3}\s+ic\d+.*$/i, "").trim();
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

// Palabras que no aportan al "tema" de un producto (conectores, no variantes de
// marca/producto) — se ignoran al buscar familia de producto en común. No es
// una lista exhaustiva de stopwords del español, solo las que aparecen en
// nombres de catálogo de proveedores reales.
const CONECTORES_PRODUCTO = new Set(["de", "del", "la", "el", "los", "las", "con", "sin", "y", "en", "a", "al"]);

// Palabras que describen packaging/dietética, no el producto ni la marca — a
// diferencia de un conector, SÍ podrían malinterpretarse como parte del "tipo"
// si no se descartan (ej. "gluten" de "s/gluten" apareciendo en casi todo el
// catálogo). Se ignoran igual que los conectores al buscar sustitutos.
const RUIDO_PRODUCTO = new Set([
  "gluten",
  "balde",
  "cajon",
  "lata",
  "bolsa",
  "sobre",
  "sobres",
  "paquete",
  "bidon",
  "bid",
  "envasado",
  "ensobrado",
]);

// Marcas/fabricantes reales observados en las listas de precios de El Criollo
// y El Emporio (ver lib/control-precios/CLAUDE.md) — al buscar sustitutos
// DENTRO de un mismo proveedor (ver sonSustitutosPorMarca), cualquier palabra
// de acá puede diferir sin que se considere un producto distinto; cualquier
// otra palabra que difiera SÍ lo descalifica como sustituto, porque se asume
// que describe el tipo/variante real del producto (ej. "repostero" vs
// "clásico" de dulce de leche: mismo "tipo" pero variantes distintas, NO
// intercambiables aunque compartan "dulce"+"leche").
//
// Lista deliberadamente parcial e incompleta — un falso negativo (no sugiere
// un sustituto válido todavía porque falta la marca acá) es preferible a un
// falso positivo (sugiere un producto que en realidad es una variante
// distinta). Si un sustituto real no aparece sugerido, agregar la marca que
// falta acá — NO aflojar la regla de abajo.
const MARCAS_CONOCIDAS = new Set([
  "vacalin", "milkaut", "serenisima", "tregar", "criollo", "lavazza", "ledesma",
  "arytza", "casalta", "hellmann", "tau", "delta", "gallo", "knorr", "aguila",
  "fenix", "mapsa", "cumana", "valles", "mayana", "agromar", "lucchetti",
  "matarazzo", "molisana", "nescafe", "green", "hills", "cachamai", "alco",
  "meridiano", "reygal", "anclas", "savora", "favinco", "menoyo", "silva",
  "alsamar", "fritolim", "fritomac", "preferido", "king", "homemade", "granix",
  "arcor", "corper", "banda", "chacabuco", "semolin", "cañuelas", "presto",
  "pronta", "femag", "nestle", "alpino", "iberia", "jorgito", "giorgio", "san",
  "urrutia", "malta", "cruz", "quesera", "esnaola", "lheritier", "gentleman",
  "reino", "leon", "bianca", "tranquera", "natura", "confianza", "fruto",
  "kanater", "hei", "men", "chiro", "timon", "paine", "nogales", "keuken",
  "celusal", "baronese",
]);

export type CantidadProducto = { valor: number; familia: "peso" | "volumen" | "conteo" };

const FAMILIA_POR_UNIDAD: Record<string, { familia: CantidadProducto["familia"]; factor: number }> = {
  kg: { familia: "peso", factor: 1000 },
  kgs: { familia: "peso", factor: 1000 },
  k: { familia: "peso", factor: 1000 },
  gr: { familia: "peso", factor: 1 },
  grs: { familia: "peso", factor: 1 },
  g: { familia: "peso", factor: 1 },
  lt: { familia: "volumen", factor: 1000 },
  lts: { familia: "volumen", factor: 1000 },
  l: { familia: "volumen", factor: 1000 },
  cc: { familia: "volumen", factor: 1 },
  ml: { familia: "volumen", factor: 1 },
  ud: { familia: "conteo", factor: 1 },
  uds: { familia: "conteo", factor: 1 },
  un: { familia: "conteo", factor: 1 },
  unid: { familia: "conteo", factor: 1 },
  unids: { familia: "conteo", factor: 1 },
  sobre: { familia: "conteo", factor: 1 },
  sobres: { familia: "conteo", factor: 1 },
};

// Mismas unidades que FAMILIA_POR_UNIDAD, para reconocer también la unidad
// SUELTA (separada del número por un espacio, ej. "X 850 GRS") — sin esto,
// una unidad de 3+ letras (grs, kgs, lts, unid...) no fusionada con el número
// quedaba como si fuera parte del nombre del producto, y dos productos con la
// unidad escrita distinto (ej. "836 GR" vs "850 GRS") parecían tener distinta
// cantidad de palabras y se rechazaban como sustitutos aunque fueran la misma
// variante (caso real: Ananá en Rodajas Cumaná 836GR vs Fruto de la Confianza
// 850GRS). Las unidades de 1-2 letras (kg, gr, lt, ud, un, cc, ml) ya quedan
// afuera solas por el filtro de longitud mínima de palabrasNucleoProducto().
const PALABRAS_UNIDAD = new Set(Object.keys(FAMILIA_POR_UNIDAD));

// Une un número pegado a una unidad ("10K", "1.45KG", "500GR") en un solo
// token — sin esto, palabrasNucleoProducto() los trataría como ruido pero
// dejaría basura suelta (ej. una letra de unidad de 1-2 caracteres) en vez de
// reconocerlos como cantidad. extraerCantidad() vuelve a parsear el texto
// original para no depender de este tokenizado.
const UNIDADES_CANTIDAD = /(kgs?|k|grs?|g|lts?|l|cc|ml|uds?|unid?s?|un|sobres?)\b/;

/** Palabras significativas de un nombre de producto para comparar "misma
 * variante, distinta marca": sin conectores, sin ruido de packaging/dietética,
 * sin cantidades (número+unidad, ej. "10kg", o unidad suelta, ej. "grs"), sin
 * palabras de 1-2 letras. */
function palabrasNucleoProducto(nombre: string): Set<string> {
  const texto = normalizarNombreProducto(nombre).replace(/[^a-z0-9ñ\s]/g, " ");
  const palabras = texto
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !CONECTORES_PRODUCTO.has(p) && !RUIDO_PRODUCTO.has(p))
    .filter((p) => !/^\d+$/.test(p)) // número suelto (cantidad, se compara aparte)
    .filter((p) => !PALABRAS_UNIDAD.has(p)) // unidad suelta ("grs", "kgs", "unid"...)
    .filter((p) => !(/^\d/.test(p) && UNIDADES_CANTIDAD.test(p))); // "10k", "500gr", etc.
  return new Set(palabras);
}

/** Extrae la primera cantidad reconocible de una descripción de producto (ej.
 * "10 KG" / "10K" / "1.45KG" / "800 UDS") normalizada a una unidad base por
 * familia (gramos, cc, o unidades) — para comparar tamaño de envase entre dos
 * productos sin importar si uno lo expresa en kg y el otro en gr. null si no
 * se reconoce ninguna cantidad (no bloquea la comparación, ver
 * tamañoComparable()). */
export function extraerCantidad(nombre: string): CantidadProducto | null {
  const texto = normalizarNombreProducto(nombre);
  const match = texto.match(/(\d+(?:[.,]\d+)?)\s*(kgs?|k|grs?|g|lts?|l|cc|ml|uds?|unid?s?|un|sobres?)\b/);
  if (!match) return null;
  const numero = Number(match[1].replace(",", "."));
  const unidad = FAMILIA_POR_UNIDAD[match[2]];
  if (!unidad || !Number.isFinite(numero)) return null;
  return { valor: numero * unidad.factor, familia: unidad.familia };
}

// Tolerancia de tamaño entre dos envases para considerarse "misma cantidad o
// diferencia mínima" (ej. 800 UDS vs 1000 UDS todavía cuenta) — más allá de
// esto, cambiar de envase ya no es un cambio de marca, es comprar otra cosa.
const TOLERANCIA_RATIO_CANTIDAD = 1.5;

/** true si dos cantidades son lo bastante parecidas como para no descartar el
 * sustituto por tamaño de envase muy distinto. Si no se pudo reconocer la
 * cantidad de alguno de los dos lados, o están en familias distintas (ej.
 * peso vs conteo), no bloquea — no hay información suficiente para negar el
 * sustituto solo por eso. */
function tamañoComparable(a: CantidadProducto | null, b: CantidadProducto | null): boolean {
  if (!a || !b || a.familia !== b.familia) return true;
  const [menor, mayor] = a.valor <= b.valor ? [a.valor, b.valor] : [b.valor, a.valor];
  if (menor <= 0) return true;
  return mayor / menor <= TOLERANCIA_RATIO_CANTIDAD;
}

/**
 * true si dos productos del MISMO proveedor son candidatos válidos a
 * sustituto por marca: mismo "núcleo" de producto (todas las palabras
 * significativas iguales, sin contar marca/packaging/cantidad) pero con AL
 * MENOS una palabra de marca distinta (ver MARCAS_CONOCIDAS) — y un tamaño de
 * envase parecido (ver tamañoComparable). Si el núcleo no coincide exacto
 * (ej. "repostero" contra "clásico", o "entera" contra "descremada"), NO es
 * sustituto aunque compartan muchas otras palabras — es la regla que evita
 * confundir "misma variante, distinta marca" con "mismo producto, distinta
 * variante" (caso real que motivó esto: dulce de leche Repostero Vacalín SÍ
 * es sustituto de Repostero Milkaut; NO lo es de Dulce de Leche Clásico).
 */
export function sonSustitutosPorMarca(a: string, b: string): boolean {
  const nucleoA = palabrasNucleoProducto(a);
  const nucleoB = palabrasNucleoProducto(b);

  const marcaA = [...nucleoA].filter((p) => MARCAS_CONOCIDAS.has(p)).sort();
  const marcaB = [...nucleoB].filter((p) => MARCAS_CONOCIDAS.has(p)).sort();

  const sinMarcaA = [...nucleoA].filter((p) => !MARCAS_CONOCIDAS.has(p)).sort();
  const sinMarcaB = [...nucleoB].filter((p) => !MARCAS_CONOCIDAS.has(p)).sort();

  if (sinMarcaA.length === 0 || sinMarcaA.length !== sinMarcaB.length) return false;
  if (sinMarcaA.some((p, i) => p !== sinMarcaB[i])) return false;

  // Si la marca es la misma de los dos lados (o ninguno tiene marca
  // reconocida), no hay cambio de marca real que ofrecer.
  if (marcaA.join(" ") === marcaB.join(" ")) return false;

  return tamañoComparable(extraerCantidad(a), extraerCantidad(b));
}

/**
 * "33-xxxxxxxx-x" / "33 xxxxxxxx x" / "33xxxxxxxxx" -> "33xxxxxxxxx" (solo
 * dígitos). Usado antes de guardar o comparar un CUIT (ver buscarOCrearProveedor
 * en actions.ts) para que el mismo proveedor real no quede duplicado solo porque
 * una factura se leyó con guiones y otra sin guiones — el `eq()` de Postgres es
 * comparación exacta de string, no entiende que son "el mismo" CUIT si no se
 * normalizan primero los dos lados igual.
 */
export function normalizarCuit(cuit: string): string {
  return cuit.replace(/\D/g, "");
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
  const digitos = normalizarCuit(cuit);
  if (digitos.length !== 11) return false;

  const numeros = digitos.split("").map(Number);
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * numeros[i], 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  if (verificador === 10) return false; // no existe dígito verificador válido

  return verificador === numeros[10];
}
