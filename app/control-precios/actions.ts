"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  cpComparacionesRestaurantesRevisadas,
  cpDetalleFacturas,
  cpDuplicadosDescartados,
  cpFacturas,
  cpFacturasRepetidasRevisadas,
  cpListasPreciosHistorial,
  cpListasPreciosProveedor,
  cpProductos,
  cpProveedores,
} from "@/db/schema";
import { CATEGORIAS_INSUMO } from "@/lib/control-precios/constantes";
import {
  esCuitValido,
  normalizarCuit,
  normalizarNombreProducto,
  sonNombresSimilares,
} from "@/lib/control-precios/normalizar";
import { and, eq, ilike, sql } from "drizzle-orm";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { get } from "@vercel/blob";
import { descargarDeR2, esClaveR2 } from "@/lib/control-precios/r2";
import { revalidatePath } from "next/cache";

const CATEGORIAS = CATEGORIAS_INSUMO;
export type CategoriaInsumo = (typeof CATEGORIAS)[number];

export type ItemFacturaIA = {
  producto_nombre: string;
  unidad_medida: string | null;
  cantidad: number;
  precio_unitario: number | null;
  // Bonificación impresa para ESTE renglón puntual (ej. "Dto." o "Bonif." al lado
  // del producto) — distinto de un descuento/percepción a nivel de toda la factura,
  // que no es un ítem y no entra acá. Null si el renglón no tiene descuento propio.
  descuento: number | null;
  // Total de línea tal cual está impreso en el papel (puede incluir IVA/Impuestos
  // Internos ya sumados) — puramente informativo/contable. El subtotal que
  // efectivamente se usa para comparar precios lo calcula el sistema siempre como
  // cantidad × precio_unitario − descuento, ver confirmarFactura(). NO se valida
  // contra ese cálculo: para varios proveedores (FEMSA, distribuidoras de vino)
  // difiere justamente porque acá sí entra el IVA.
  subtotal_impreso: number | null;
  // Tasa de IVA de ESTE renglón si es legible o se puede inferir (ej. la factura
  // discrimina "21%" al pie y aplica a todos los ítems). Null si no se puede
  // determinar. Informativo — nunca se usa para elegir o ajustar precio_unitario.
  iva_porcentaje: number | null;
};

export type FacturaExtraidaIA = {
  proveedor_nombre: string;
  proveedor_cuit: string | null;
  // Número de comprobante impreso (ej. "0009-00719112", a veces con punto de
  // venta y número separados). Se usa en confirmarFactura() para detectar si
  // esta factura ya se cargó antes — ver el índice único en cp_facturas.
  numero_factura: string | null;
  fecha_emision: string; // YYYY-MM-DD
  // null cuando esta página/foto no imprime el TOTAL final del comprobante (típico
  // de la primera hoja de una factura de varias páginas, donde el total solo
  // aparece en la última) — ver la regla de monto_total en PROMPT_EXTRACCION y el
  // comentario sobre facturas multipágina en confirmarFactura(). Nunca se estima
  // sumando los ítems de una sola página: eso duplicaba el total real al sumarse
  // con el de la página que sí trae el TOTAL impreso (caso real: Distribuidora El
  // Criollo SRL, comprobante 0009-00701278, corregido 2026-08-07).
  monto_total: number | null;
  categoria_sugerida: CategoriaInsumo;
  // Nombre del comprador/cliente/destinatario impreso en la factura, si figura —
  // NO se usa para asignar el restaurante (eso lo elige la persona por lote, ver
  // CargaComprobanteForm), solo sirve de cruce para avisar si no coincide con el
  // restaurante elegido.
  cliente_detectado: string | null;
  items: ItemFacturaIA[];
};

const PROMPT_EXTRACCION = `
Sos un asistente contable que extrae datos de comprobantes de proveedores
gastronómicos argentinos (carnicerías, verdulerías, almacenes, bebidas,
descartables) a partir de una foto o PDF. Muchas veces la foto viene sacada con el
celular desde WhatsApp: puede estar arrugada, mal iluminada, inclinada o con texto
manuscrito — hacé el mayor esfuerzo posible de lectura antes de dejar un campo vacío.
Algunos proveedores (ej. FEMSA, Cervecería Quilmes) imprimen el comprobante en
formato horizontal/apaisado, y la foto puede haber quedado girada 90° o 180° (el
texto corre de costado o al revés) — identificá la orientación correcta del texto y
leelo igual, sin dejar de extraer nada por eso.

Reglas:
- El CUIT argentino tiene formato XX-XXXXXXXX-X. Si no es legible o no figura,
  dejá "proveedor_cuit" en null. No inventes un CUIT.
- OJO: la mayoría de los comprobantes imprimen DOS CUIT — el de quien EMITE la
  factura (el proveedor, generalmente en el encabezado junto al nombre/domicilio
  comercial/logo) y el del CLIENTE/comprador (generalmente en el bloque
  "Señor(es)"/"Cliente:"/destinatario, junto con su nombre y dirección de
  entrega). "proveedor_cuit" es SIEMPRE el del emisor — confirmá que el CUIT que
  elegiste esté pegado al nombre del proveedor que pusiste en "proveedor_nombre",
  no al nombre que pusiste en "cliente_detectado". Mezclar los dos hace que la
  misma proveedora termine duplicada como si fueran empresas distintas (una por
  cada cliente distinto que aparezca en su factura).
- "numero_factura" es el número de comprobante impreso, normalmente cerca de
  "Factura Nº"/"Comprobante Nº"/"Nº" en el encabezado — a menudo viene como punto
  de venta + número separados por un guion o salto de línea (ej. "0009" y
  "00719112"); si es así, extraelo combinado como aparece armado en el papel (ej.
  "0009-00719112"). Es clave para poder detectar si esta misma factura ya se
  cargó antes, así que prestale atención — pero si no es legible, dejalo en null,
  no inventes un número.
- La fecha de emisión va en formato YYYY-MM-DD.
- "monto_total" es el TOTAL FINAL impreso al pie del comprobante (la suma
  definitiva a pagar — "TOTAL", "Total a Pagar", "Importe Total", etc.), CON
  impuestos/IVA/percepciones incluidos si el comprobante los suma ahí.
  IMPORTANTE — comprobantes de VARIAS PÁGINAS: muchos proveedores imprimen el
  TOTAL final SOLO en la última página (las anteriores muestran los ítems pero
  no cierran con un total). Si ESTA página/foto en particular no imprime ese
  total final (por ejemplo, es la primera hoja de un comprobante que se nota
  continúa: dice "Página 1 de 2", el listado de ítems corta de golpe, o
  simplemente no hay ninguna fila de TOTAL al pie), dejá "monto_total" en
  null — NO lo inventes, y NO sumes vos los precios de los ítems de esta
  página para estimarlo, aunque te parezca fácil de calcular. Extraé igual
  todos los ítems y sus precios unitarios de esta página con normalidad, eso
  no cambia. Solo la página que efectivamente tiene impreso el TOTAL final
  lleva "monto_total" con ese valor. Poner un monto inventado en una página
  que no es la última hace que el total de esa factura se cuente dos veces
  cuando alguien sume ambas páginas.
- Sugerí "categoria_sugerida" según el rubro del proveedor: CARNE, PESCADERIA,
  ALMACEN, VERDULERIA, BEBIBLES o DESCARTABLES. PESCADERIA es pescado y frutos
  de mar — no lo confundas con CARNE (vacuna/aviar).
- Si el comprobante imprime a nombre de quién está hecha la compra (cliente,
  comprador, destinatario, razón social del "Señor(es)"), extraelo en
  "cliente_detectado". Muchos remitos informales no lo imprimen — en ese caso, null.
- Para cada ítem extraé el nombre del producto tal como figura (sin traducir ni
  "limpiar" de más), la unidad de medida si figura (kg, unidad, pack, etc.) y la
  cantidad.
- "items" son solo productos o mercadería realmente comprada. NO incluyas como
  ítem las líneas de percepciones de IVA/IIBB, retenciones, impuestos, flete o
  cualquier otro concepto que no sea un producto en sí, ni un descuento/bonificación
  que aparezca como su PROPIA línea separada (a nivel de toda la factura) — esas
  líneas no tienen cantidad ni precio unitario real de un producto y van a ensuciar
  el reporte de precios. Si tenés dudas de si una línea es un producto o un
  concepto administrativo, dejala afuera de "items".

PRECIO UNITARIO — es el dato más importante de toda la extracción, el sistema
existe para comparar este número en el tiempo. Prestale más atención que a
cualquier otro campo:
- Si hay una columna explícita "Precio Unitario" (o "P. Unit.", "Precio x kg/u",
  etc.) usá esa, sin más.
- Si NO la hay, buscá un campo equivalente que sí esté impreso en el renglón de
  ESE producto puntual — columnas tipo "Neto", "Precio Neto", "Precio Único",
  "Precio s/IVA" cuentan. Pero antes de usarlo como "precio_unitario" verificá que
  sea realmente un precio POR UNIDAD y no un TOTAL de ese renglón ya multiplicado
  por la cantidad — es un error común que las columnas "Neto"/"Subtotal"/"Total"
  de una misma fila terminen mostrando el mismo número o números muy parecidos:
    · Si el candidato (ej. el valor de "Neto") es aproximadamente IGUAL al
      subtotal/total impreso de esa misma línea, y la cantidad de ese renglón es
      distinta de 1, ESE CANDIDATO NO ES EL PRECIO UNITARIO — es en realidad el
      total de la línea (cantidad × precio real). En ese caso el precio unitario
      real es candidato ÷ cantidad, y ESO es lo que va en "precio_unitario".
    · Si en cambio candidato × cantidad ≈ subtotal/total impreso de esa línea,
      el candidato sí es genuinamente el precio unitario — usalo tal cual.
    · Si la cantidad de ese renglón es 1, no hay ambigüedad posible, cualquiera
      de los dos caminos da el mismo número.
  Esta verificación aplica también al CASO ESPECIAL de tablas de mayoristas de
  bebidas descripto más abajo.
- OJO con el alcance de "Neto": en muchas facturas argentinas "Neto Gravado" (o
  "Subtotal Neto") aparece en el PIE de la factura como un total de TODA la
  factura, no de un renglón. Ese campo de pie de página NUNCA es candidato a
  "precio_unitario" de un ítem — solo sirve un "Neto" que esté impreso DENTRO de
  la fila de ese producto específico.
- Si después de todo esto el precio unitario de un ítem sigue sin poder
  determinarse (no está impreso ni hay forma confiable de derivarlo), dejá
  "precio_unitario" en null. NUNCA inventes ni estimes un precio que no esté
  impreso en el papel (salvo la derivación candidato÷cantidad de arriba, que no es
  inventar: es leer el mismo número impreso, dividido).

DESCUENTO Y SUBTOTAL:
- "descuento" es la bonificación impresa DENTRO del renglón de un producto
  puntual (ej. "Dto. 10%" o un monto de bonificación al lado de ese ítem, común en
  remitos de bebidas/FEMSA) — en pesos, no en %; si solo figura el %, calculalo
  sobre cantidad × precio_unitario. Si el ítem no tiene descuento propio, dejá
  "descuento" en null. Un descuento a nivel de TODA la factura (su propia línea
  separada, no dentro de un renglón de producto) no es un ítem y no entra acá.
  OJO — antes de convertir un "% Dto" en un valor de "descuento", verificá si ese
  % YA ESTÁ DESCONTADO del "precio_unitario"/"P.U." que ya elegiste, en vez
  de asumir que hay que restarlo de nuevo: si cantidad × precio_unitario YA
  coincide con el "Total" impreso de esa línea (sin restar el % de Dto encima),
  el descuento ya viene aplicado en el precio unitario — dejá "descuento" en
  null, NO lo restes una segunda vez. Recién calculá "descuento" en pesos cuando
  cantidad × precio_unitario sea MAYOR que el "Total" impreso de esa línea (ahí
  sí el descuento todavía no está aplicado y falta restarlo). Caso real que
  motivó esto: HORECA SRL, factura 0009-00228077 — imprime "%Dto 10.000" en cada
  renglón, pero su propio "Total" de línea y el "Neto" final NO le restan ese
  10%; se necesitaba "descuento" en null, no calculado sobre el %.
- "subtotal_impreso" es el total de esa línea tal cual está impreso en el papel
  (columna "Subtotal", "Importe", "Total renglón", etc.), sin importar si incluye
  IVA/Impuestos Internos o no — extraelo tal cual figura, NO lo valides ni lo
  ajustes contra cantidad × precio_unitario (el sistema calcula su propio
  subtotal aparte; este campo es solo referencia contable). Null si no hay ninguna
  columna de total por línea impresa.
- "iva_porcentaje" es la tasa de IVA de ese renglón si es legible o se puede
  inferir (ej. la factura discrimina una sola tasa como "21%" o "10.5%" al pie y
  aplica a todos los ítems). Null si no se puede determinar.
- CASO ESPECIAL — tabla con varias columnas de precio por renglón (típico de
  distribuidoras mayoristas de bebidas y de vinos, factura tipo A con "IVA
  Responsable Inscripto"): a veces cada línea trae "Precio Lista"/"Precio
  Unitario", una o más columnas de "% Dto."/"Bonificación %"/"Bon.%"/"Descuento
  %", "Importe Dto.", "Precio s/Impuestos" (o "Precio Neto"/"Precio sin IVA"),
  "Subtotal"/"Importe" y "Precio Bot." (precio por unidad, informativo), todas
  juntas. En ese caso:
    · "precio_unitario" es SIEMPRE la columna "Precio Neto" (el precio ya con la
      bonificación/descuento de esa tabla aplicado) — NUNCA "Precio Lista"/"Precio
      Unitario" (el precio de lista, previo a la bonificación) ni "Precio Bot.".
      Esto vale sin importar la cantidad del renglón: con cantidad 1 la
      verificación de "candidato × cantidad ≈ Subtotal" no alcanza para
      distinguir Precio Lista de Precio Neto (ambos "cierran" contra un Subtotal
      de una sola unidad), así que la regla acá es posicional/por nombre de
      columna, no por el cálculo.
    · "subtotal_impreso" es directamente el valor de la columna "Subtotal"/"Importe".
    · NO vuelvas a poner el "% Dto." o "Importe Dto." de esa tabla en el campo
      "descuento" del ítem — ese descuento ya está incorporado en el precio neto
      que elegiste como "precio_unitario", contarlo dos veces da un subtotal
      incorrecto. "descuento" queda en null salvo que haya una bonificación
      ADICIONAL aparte de esta tabla de precios.
    · El IVA, los Impuestos Internos y las percepciones de estas facturas casi
      siempre se suman UNA SOLA VEZ al pie, después de sumar los subtotales de
      todos los renglones — por eso el total de la factura queda por encima de la
      suma de los "Subtotal" de los ítems. Eso es normal en este tipo de
      comprobante, no repartas esos impuestos entre los ítems ni ajustes
      "precio_unitario" para tratar de que cierren contra el total.
- CASO ESPECIAL: si es un remito o factura de una VERDULERIA y el comprobante no
  imprime precio unitario ni ningún total para uno o varios ítems (algo común en
  estos remitos), dejá "precio_unitario" y "subtotal_impreso" en null para esos
  ítems.
- Si un campo no es legible o no aplica, usá null en vez de adivinar.
`.trim();

const FACTURA_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    proveedor_nombre: { type: SchemaType.STRING },
    proveedor_cuit: { type: SchemaType.STRING, nullable: true },
    numero_factura: { type: SchemaType.STRING, nullable: true },
    fecha_emision: { type: SchemaType.STRING, description: "Formato YYYY-MM-DD" },
    monto_total: { type: SchemaType.NUMBER, nullable: true },
    categoria_sugerida: { type: SchemaType.STRING, format: "enum", enum: [...CATEGORIAS] },
    cliente_detectado: { type: SchemaType.STRING, nullable: true },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          producto_nombre: { type: SchemaType.STRING },
          unidad_medida: { type: SchemaType.STRING, nullable: true },
          cantidad: { type: SchemaType.NUMBER },
          precio_unitario: { type: SchemaType.NUMBER, nullable: true },
          descuento: { type: SchemaType.NUMBER, nullable: true },
          subtotal_impreso: { type: SchemaType.NUMBER, nullable: true },
          iva_porcentaje: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ["producto_nombre", "cantidad"],
      },
    },
  },
  required: ["proveedor_nombre", "fecha_emision", "categoria_sugerida", "items"],
};

function requerirSesion() {
  return auth().then((session) => {
    if (!session?.user?.email) throw new Error("No autorizado.");
    return session;
  });
}

function esErrorTransitorio(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: number }).status;
  return (
    status === 429 ||
    status === 503 ||
    /429|503|rate limit|quota|overloaded|high demand|timeout|timed out|aborted/i.test(error.message)
  );
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "gemini-flash-latest"/"gemini-pro-latest" son alias que Google mantiene apuntando
 * al modelo vigente de cada categoría — evitan tener que salir a cambiar esto cada
 * vez que retiran un snapshot fijo (ya pasó dos veces: gemini-1.5-pro-002 y
 * gemini-2.5-pro dejaron de estar disponibles para cuentas nuevas).
 */
// "gemini-flash-latest" (el tier "flash" estándar) tiene historial de saturarse en
// picos de demanda de Google — "flash-lite" viene respondiendo mejor en la práctica.
// Igual queda configurable por si el panorama cambia.
const MODELO_FLASH = process.env.GEMINI_MODEL_FLASH ?? "gemini-flash-lite-latest";
const MODELO_PRO = process.env.GEMINI_MODEL_PRO ?? "gemini-pro-latest";

async function extraerConModelo(
  buffer: Buffer,
  mimeType: string,
  nombreModelo: string,
  intentos = 3
): Promise<FacturaExtraidaIA> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY (ver .env.example).");
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: nombreModelo,
    systemInstruction: PROMPT_EXTRACCION,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: FACTURA_SCHEMA,
    },
  });

  const contenido = [
    { inlineData: { data: buffer.toString("base64"), mimeType } },
    { text: "Extraé los datos de este comprobante." },
  ];

  let resultado;
  for (let intento = 0; ; intento++) {
    try {
      // El SDK no tiene timeout por default: visto en la práctica que una request
      // puede quedar colgada sin tirar error ni responder (ni éxito ni 429/503) —
      // sin esto, esa única llamada trababa para siempre un batch entero (ver
      // scripts/reanalizar-calidad-datos.ts). 90s es generoso para un PDF de varias
      // páginas con el modelo "pro".
      resultado = await model.generateContent(contenido, { timeout: 90_000 });
      break;
    } catch (error) {
      // Backoff exponencial ante 429/503: un pico de demanda sostenido en Google
      // (visto en la práctica con "flash") puede durar más que un solo reintento
      // corto — 2s, 4s, 8s da más margen antes de rendirse.
      if (!esErrorTransitorio(error) || intento >= intentos - 1) throw error;
      await esperar(2000 * 2 ** intento + Math.random() * 1000);
    }
  }

  const texto = resultado.response.text();
  try {
    return JSON.parse(texto) as FacturaExtraidaIA;
  } catch {
    throw new Error("Gemini no devolvió un JSON válido. Probá de nuevo o cargá los datos a mano.");
  }
}

/** Señales de que la extracción salió mal: ítems sin nombre, cero ítems, o un total
 * que no cierra contra la suma de subtotales (cuando todos los ítems sí tienen
 * precio — si hay nulls de VERDULERIA sin referencia, la suma no es comparable).
 *
 * El subtotal "propio" (cantidad × precio_unitario − descuento) es neto de
 * IVA/Impuestos Internos, mientras que monto_total los incluye — no se pueden
 * comparar directo. Se intenta reconstruir el total esperado en capas, de más a
 * menos preciso, según qué dato haya extraído la IA para cada ítem: primero con
 * iva_porcentaje (más confiable), si no con subtotal_impreso (que ya suele venir
 * con IVA incluido tal cual lo imprime el proveedor), y si no hay ninguno de los
 * dos no se hace este chequeo — no hay forma confiable de validar sin inventar
 * una tasa, y no corresponde penalizar la factura solo por eso. */
function pareceIncompleta(factura: FacturaExtraidaIA): boolean {
  if (!factura.items || factura.items.length === 0) return true;
  if (factura.items.some((i) => !i.producto_nombre?.trim())) return true;

  const todosConPrecio = factura.items.every((i) => i.precio_unitario !== null && i.precio_unitario !== undefined);
  // monto_total en null es esperado (y no un error) en la primera página de un
  // comprobante multipágina — ver la regla en PROMPT_EXTRACCION. No hay total
  // contra el que validar, así que se salta el chequeo en vez de marcarla incompleta.
  if (!todosConPrecio || factura.monto_total === null || factura.monto_total <= 0) return false;

  const subtotalesPropios = factura.items.map(
    (i) => (i.precio_unitario ?? 0) * i.cantidad - (i.descuento ?? 0)
  );

  let esperado: number | null = null;
  if (factura.items.every((i) => i.iva_porcentaje !== null && i.iva_porcentaje !== undefined)) {
    esperado = subtotalesPropios.reduce(
      (acc, subtotal, idx) => acc + subtotal * (1 + (factura.items[idx].iva_porcentaje ?? 0) / 100),
      0
    );
  } else if (
    factura.items.every((i) => i.subtotal_impreso !== null && i.subtotal_impreso !== undefined)
  ) {
    esperado = factura.items.reduce((acc, i) => acc + (i.subtotal_impreso ?? 0), 0);
  }

  if (esperado === null) return false;
  const diferencia = Math.abs(esperado - factura.monto_total);
  const tolerancia = Math.max(factura.monto_total * 0.05, 50);
  return diferencia > tolerancia;
}

/**
 * Descarga el comprobante desde Vercel Blob y lo manda a Gemini con salida
 * estructurada (responseSchema). No persiste nada todavía — el resultado va a la
 * pantalla de validación editable, y confirmarFactura() recién ahí escribe en Neon.
 *
 * Estrategia híbrida por volumen/costo: primero se prueba con el modelo "flash"
 * (varias veces más rápido y barato). Se reprocesa la misma imagen con "pro" en
 * dos casos: (a) el resultado tiene pinta de estar mal (ítems sin nombre, total que
 * no cierra), o (b) flash directamente no respondió tras sus reintentos (ej. pico
 * de demanda sostenido en Google) — mejor una carga más lenta que una carga que
 * falla y hay que reintentar a mano. La mayoría de las facturas nunca llegan a
 * necesitar el segundo paso.
 */
/** Facturas nuevas guardan una clave de R2 en archivo_url; las cargadas antes de
 * la migración (ver lib/control-precios/CLAUDE.md) siguen con la URL completa de
 * Vercel Blob de siempre — se distingue con esClaveR2() para poder reanalizar
 * (reanalizarFacturaInterno) facturas viejas y nuevas por igual. */
async function descargarComprobante(archivoRef: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (esClaveR2(archivoRef)) {
    const { buffer, contentType } = await descargarDeR2(archivoRef);
    return { buffer, mimeType: contentType };
  }
  // El store de Blob es privado: un fetch() sin autenticar contra la URL da 403.
  // get() firma la request con BLOB_READ_WRITE_TOKEN (de env) automáticamente.
  const descargado = await get(archivoRef, { access: "private" });
  if (!descargado || descargado.statusCode !== 200) {
    throw new Error("No se pudo descargar el comprobante desde Blob.");
  }
  const buffer = Buffer.from(await new Response(descargado.stream).arrayBuffer());
  return { buffer, mimeType: descargado.blob.contentType || "image/jpeg" };
}

export async function procesarComprobante(
  archivoRef: string
): Promise<{ factura: FacturaExtraidaIA; modelo: "flash" | "pro" }> {
  await requerirSesion();
  return procesarComprobanteInterno(archivoRef);
}

/** Misma lógica que procesarComprobante(), sin el chequeo de sesión — separada
 * para que scripts/probar-reanalisis.ts (y reanalizarFactura(), que corre server-side
 * tras su propio requerirSesion()) puedan invocarla directo. Ver el mismo patrón en
 * fusionarProveedoresInterno(). */
async function procesarComprobanteInterno(
  archivoRef: string
): Promise<{ factura: FacturaExtraidaIA; modelo: "flash" | "pro" }> {
  const { buffer, mimeType } = await descargarComprobante(archivoRef);

  let conFlash: FacturaExtraidaIA | null = null;
  try {
    conFlash = await extraerConModelo(buffer, mimeType, MODELO_FLASH);
  } catch (error) {
    if (!esErrorTransitorio(error)) throw error;
    // Flash no respondió ni con reintentos — probamos directo con Pro en vez de
    // fallar la carga entera.
  }

  if (conFlash && !pareceIncompleta(conFlash)) {
    return { factura: conFlash, modelo: "flash" };
  }

  const conPro = await extraerConModelo(buffer, mimeType, MODELO_PRO);
  return { factura: conPro, modelo: "pro" };
}

export type ResultadoProveedor = {
  id: number;
  // Nombre del proveedor YA existente con el que este choca en nombre pero no en
  // CUIT — se devuelve para que confirmarFactura() pueda avisar en vez de dejar
  // crear un duplicado silencioso (ver historial de "Coca-Cola FEMSA" fusionado
  // 5 veces por CUIT mal leído). Null si no hay conflicto.
  posibleDuplicado: string | null;
};

/**
 * Resuelve el proveedor de una factura evitando crear duplicados de dos formas:
 *
 * 1. Un CUIT con dígito verificador matemáticamente imposible (ver esCuitValido)
 *    se trata como si no se hubiera leído ningún CUIT — es casi siempre un
 *    dígito mal leído de la foto, y usarlo tal cual para buscar/crear generaba
 *    un proveedor fantasma por cada lectura distinta del mismo número.
 * 2. Si el nombre coincide con un proveedor ya cargado (misma heurística que la
 *    pantalla de fusión manual, ver sonNombresSimilares) y ese proveedor todavía
 *    no tiene CUIT confirmado, o el CUIT de esta factura no pudo leerse, se
 *    reutiliza ese proveedor en vez de crear uno nuevo — así una empresa que a
 *    veces imprime el CUIT ilegible no se fragmenta en varias filas.
 *    Si en cambio SÍ hay un CUIT válido pero distinto al ya confirmado para ese
 *    nombre, no se fusiona solo (podría ser realmente otra empresa con nombre
 *    parecido) — se crea aparte, pero se avisa en el resultado para que se
 *    revise a mano en vez de quedar un duplicado invisible.
 */
export async function buscarOCrearProveedor(datos: {
  nombre: string;
  cuit: string | null;
  categoria: CategoriaInsumo;
}): Promise<ResultadoProveedor> {
  const nombre = datos.nombre.trim();
  // Normalizado a solo dígitos ANTES de validar/comparar/guardar: así
  // "33-xxxxxxxx-x" y "33xxxxxxxxx" (mismo CUIT, dos lecturas con formato
  // distinto) son el mismo string y matchean por eq() más abajo, en vez de
  // crear un proveedor nuevo por una diferencia de guiones.
  const cuitLeido = datos.cuit ? normalizarCuit(datos.cuit) : null;
  const cuit = cuitLeido && esCuitValido(cuitLeido) ? cuitLeido : null;

  if (cuit) {
    const [porCuit] = await db
      .select({ id: cpProveedores.id })
      .from(cpProveedores)
      .where(eq(cpProveedores.cuit, cuit))
      .limit(1);
    if (porCuit) return { id: porCuit.id, posibleDuplicado: null };
  }

  const existentes = await db
    .select({ id: cpProveedores.id, nombre: cpProveedores.nombre, cuit: cpProveedores.cuit })
    .from(cpProveedores);
  const porNombre = existentes.find((p) => sonNombresSimilares(p.nombre, nombre));

  if (porNombre && (!cuit || !porNombre.cuit)) {
    // Se completa el CUIT del proveedor existente si ahora llegó uno válido y
    // antes no tenía — para que la próxima factura ya matchee directo por CUIT.
    if (cuit && !porNombre.cuit) {
      await db.update(cpProveedores).set({ cuit }).where(eq(cpProveedores.id, porNombre.id));
    }
    return { id: porNombre.id, posibleDuplicado: null };
  }

  const insertado = await db
    .insert(cpProveedores)
    .values({ nombre, cuit, categoria: datos.categoria })
    .onConflictDoNothing({ target: cpProveedores.cuit })
    .returning({ id: cpProveedores.id });
  if (insertado[0]) return { id: insertado[0].id, posibleDuplicado: porNombre?.nombre ?? null };

  // Solo puede pasar con cuit presente (carrera concurrente entre dos locales
  // cargando el mismo proveedor nuevo casi al mismo tiempo) — sin cuit el insert
  // nunca conflictúa, un índice único no bloquea múltiples NULL.
  const [reintento] = await db
    .select({ id: cpProveedores.id })
    .from(cpProveedores)
    .where(eq(cpProveedores.cuit, cuit as string))
    .limit(1);
  if (!reintento) throw new Error(`No se pudo resolver el proveedor "${nombre}".`);
  return { id: reintento.id, posibleDuplicado: porNombre?.nombre ?? null };
}

async function buscarOCrearProducto(datos: {
  nombre: string;
  proveedorId: number;
  unidadMedida?: string | null;
}): Promise<number> {
  const nombre = datos.nombre.trim();
  const nombreNormalizado = normalizarNombreProducto(nombre);

  // Comparación en memoria contra el nombre normalizado (acentos/mayúsculas/
  // espacios repetidos, ver normalizarNombreProducto) en vez de un ilike exacto
  // contra la columna cruda — así "Hielo x 15 kg." y "hielo  x 15  Kg." (mismo
  // producto, lectura de IA con espacios/acentos distintos) matchean al mismo
  // producto en vez de crear uno nuevo. Mismo patrón que ya usa
  // buscarOCrearProveedor con sonNombresSimilares.
  const existentesDelProveedor = await db
    .select({ id: cpProductos.id, nombre: cpProductos.nombre })
    .from(cpProductos)
    .where(eq(cpProductos.proveedorId, datos.proveedorId));
  const existente = existentesDelProveedor.find(
    (p) => normalizarNombreProducto(p.nombre) === nombreNormalizado
  );
  if (existente) return existente.id;

  const insertado = await db
    .insert(cpProductos)
    .values({
      nombre,
      proveedorId: datos.proveedorId,
      unidadMedida: datos.unidadMedida?.trim() || "u",
    })
    .onConflictDoNothing({ target: [cpProductos.nombre, cpProductos.proveedorId] })
    .returning({ id: cpProductos.id });
  if (insertado[0]) return insertado[0].id;

  const [reintento] = await db
    .select({ id: cpProductos.id })
    .from(cpProductos)
    .where(and(eq(cpProductos.proveedorId, datos.proveedorId), ilike(cpProductos.nombre, nombre)))
    .limit(1);
  if (!reintento) throw new Error(`No se pudo resolver el producto "${nombre}".`);
  return reintento.id;
}

/** Sugerencias de proveedores existentes para la pantalla de validación ("¿es este
 * proveedor?"). Heurística simple por ILIKE, no similitud por trigramas (pg_trgm no
 * está habilitado en la base) — alcanza para variantes de mayúsculas/espacios, no
 * para errores de tipeo grandes. */
export async function buscarProveedoresSimilares(termino: string) {
  await requerirSesion();
  const term = termino.trim();
  if (term.length < 2) return [];
  return db
    .select({ id: cpProveedores.id, nombre: cpProveedores.nombre, categoria: cpProveedores.categoria })
    .from(cpProveedores)
    .where(ilike(cpProveedores.nombre, `%${term}%`))
    .limit(5);
}

export type ResultadoConfirmarFactura =
  | { ok: true; facturaId: number; pendienteRevision: boolean; posibleDuplicado: string | null }
  | { ok: false; error: string };

/**
 * Persiste la factura ya validada/corregida por el usuario. La factura queda en
 * 'pendiente_revision' si algún ítem se quedó sin precio (típicamente un remito de
 * VERDULERIA sin precio impreso) — nunca se bloquea la carga del resto por eso.
 *
 * Devuelve `{ ok: false, error }` en vez de lanzar una excepción para los casos
 * esperados (factura duplicada, fecha rara, etc.) — Next.js 16 redacta el
 * mensaje de cualquier `throw` de una Server Action en producción (buena
 * práctica de seguridad, pero nos tapaba a nosotros mismos el mensaje claro que
 * el usuario necesita ver para corregir el problema). Solo dejar `throw` para
 * errores realmente inesperados (bugs), donde SÍ queremos el mensaje genérico.
 */
export async function confirmarFactura(
  datos: FacturaExtraidaIA,
  archivoRef: string,
  localId: number | null
): Promise<ResultadoConfirmarFactura> {
  await requerirSesion();

  const proveedorNombre = datos.proveedor_nombre?.trim();
  if (!proveedorNombre) return { ok: false, error: "Falta el nombre del proveedor." };
  if (!datos.fecha_emision) return { ok: false, error: "Falta la fecha de emisión." };
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "La factura no tiene ítems." };
  }

  // Bloqueo duro: la IA a veces confunde un dígito del año al leer fotos de mala
  // calidad (ej. "2024" en vez de "2026") — pasó con Distribuidora Argentum. Una
  // factura recién fotografiada no puede ser de otro año ni tener fecha futura,
  // así que estos casos nunca se guardan solos: se corta acá con un mensaje claro
  // para que la persona corrija la fecha en el editor antes de reintentar
  // confirmar. Mismo criterio que ya usa obtenerFacturasConFechaSospechosa() para
  // detectar estos casos post-hoc, pero acá se corta ANTES de que lleguen a la BD.
  const hoyArgentina = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  const hoy = new Date(hoyArgentina);
  const anioActual = hoy.getFullYear();
  const anioFactura = Number(datos.fecha_emision.slice(0, 4));
  if (anioFactura !== anioActual) {
    return {
      ok: false,
      error:
        `La fecha de emisión leída es ${datos.fecha_emision} (año ${anioFactura}), pero estamos en ${anioActual}. ` +
        `Seguramente la IA confundió un dígito del año al leer la foto — corregí la fecha antes de confirmar.`,
    };
  }
  const hoyISO = `${anioActual}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  if (datos.fecha_emision > hoyISO) {
    return {
      ok: false,
      error:
        `La fecha de emisión leída es ${datos.fecha_emision}, posterior a hoy (${hoyISO}) — una factura ya recibida ` +
        `no puede tener fecha futura. Seguramente la IA confundió un dígito del día o del mes — corregí la fecha ` +
        `antes de confirmar.`,
    };
  }

  const { id: proveedorId, posibleDuplicado } = await buscarOCrearProveedor({
    nombre: proveedorNombre,
    cuit: datos.proveedor_cuit,
    categoria: datos.categoria_sugerida,
  });

  const numeroFactura = datos.numero_factura?.trim() || null;
  // Chequeo pensado para cargas de facturas viejas en lote, donde es fácil
  // repetir sin darse cuenta la foto de un comprobante ya cargado. El número de
  // factura solo es único DENTRO de cada proveedor, y además NO alcanza solo con
  // que coincida: un comprobante de varias páginas imprime el mismo número en
  // cada hoja, pero cada página trae productos distintos — si bloqueáramos solo
  // por número, la página 2 de una factura real nunca se podría cargar. Por eso
  // también se compara qué productos trae esta lectura contra los que ya están
  // guardados bajo esa factura: recién si la mayoría se repiten es probable que
  // sea la misma foto cargada dos veces, no una página nueva.
  if (numeroFactura) {
    const [yaCargada] = await db
      .select({ id: cpFacturas.id, fechaEmision: cpFacturas.fechaEmision })
      .from(cpFacturas)
      .where(and(eq(cpFacturas.proveedorId, proveedorId), eq(cpFacturas.numeroFactura, numeroFactura)))
      .limit(1);
    if (yaCargada) {
      const productosExistentes = await db
        .select({ nombre: cpProductos.nombre })
        .from(cpDetalleFacturas)
        .innerJoin(cpProductos, eq(cpProductos.id, cpDetalleFacturas.productoId))
        .where(eq(cpDetalleFacturas.facturaId, yaCargada.id));
      const nombresExistentes = new Set(productosExistentes.map((p) => normalizarNombreProducto(p.nombre)));

      const itemsValidos = datos.items.filter((i) => i.producto_nombre?.trim());
      const repetidos = itemsValidos.filter((i) => nombresExistentes.has(normalizarNombreProducto(i.producto_nombre)));
      const proporcionRepetida = itemsValidos.length > 0 ? repetidos.length / itemsValidos.length : 0;

      if (proporcionRepetida > 0.5) {
        return {
          ok: false,
          error:
            `Esta factura ya está cargada: "${proveedorNombre}" ya tiene el comprobante N° ${numeroFactura} con ` +
            `los mismos productos (factura #${yaCargada.id}, del ${yaCargada.fechaEmision}). Si en realidad es ` +
            `otra página del mismo comprobante con productos distintos, revisá que los nombres se hayan leído bien.`,
        };
      }
      // Si los productos son mayormente distintos, se deja pasar: es otra
      // página del mismo número de comprobante, y se guarda como una factura
      // aparte — igual que hoy cada foto cargada queda como su propia fila.
    }
  }

  type FilaDetalle = {
    productoId: number;
    cantidad: string;
    precioUnitario: string | null;
    descuento: string | null;
    subtotal: string | null;
    subtotalImpreso: string | null;
    ivaPorcentaje: string | null;
    precioOrigen: "factura" | "manual";
  };

  const detalle: FilaDetalle[] = [];
  let facturaIncompleta = false;

  for (const item of datos.items) {
    if (!item.producto_nombre?.trim() || !Number.isFinite(item.cantidad)) continue;

    const productoId = await buscarOCrearProducto({
      nombre: item.producto_nombre,
      proveedorId,
      unidadMedida: item.unidad_medida,
    });

    const precioUnitario = item.precio_unitario;
    const descuento = item.descuento ?? null;
    let origen: FilaDetalle["precioOrigen"] = "factura";

    // Sin precio impreso (típico de un remito de VERDULERIA): queda pendiente de
    // carga manual — se resuelve después desde el panel de calidad de datos
    // (ver ItemsPendientesDePrecioPanel / asignarPrecioManual).
    if (precioUnitario === null || precioUnitario === undefined) {
      origen = "manual";
    }

    // El subtotal que se persiste (y que usan todos los reportes) SIEMPRE se
    // calcula acá, nunca se toma del papel: precio_unitario es la prioridad y el
    // subtotal impreso de muchos proveedores (FEMSA, distribuidoras de vino) ya
    // trae IVA/Impuestos Internos sumados, lo que ensuciaría la comparación de
    // precio unitario en el tiempo. Ese valor impreso se guarda aparte, sin
    // recalcular, en subtotal_impreso — ver ItemFacturaIA.
    let subtotal: number | null = null;
    if (precioUnitario === null || precioUnitario === undefined) {
      facturaIncompleta = true;
    } else {
      subtotal = precioUnitario * item.cantidad - (descuento ?? 0);
    }

    detalle.push({
      productoId,
      cantidad: item.cantidad.toFixed(2),
      precioUnitario: precioUnitario != null ? precioUnitario.toFixed(2) : null,
      descuento: descuento != null ? descuento.toFixed(2) : null,
      subtotal: subtotal != null ? subtotal.toFixed(2) : null,
      subtotalImpreso: item.subtotal_impreso != null ? item.subtotal_impreso.toFixed(2) : null,
      ivaPorcentaje: item.iva_porcentaje != null ? item.iva_porcentaje.toFixed(2) : null,
      precioOrigen: origen,
    });
  }

  if (detalle.length === 0) return { ok: false, error: "Ningún ítem de la factura pudo procesarse." };

  const [factura] = await db
    .insert(cpFacturas)
    .values({
      proveedorId,
      localId,
      fechaEmision: datos.fecha_emision,
      montoTotal: datos.monto_total != null ? datos.monto_total.toFixed(2) : null,
      archivoUrl: archivoRef,
      estado: facturaIncompleta ? "pendiente_revision" : "confirmada",
      numeroFactura,
    })
    .returning({ id: cpFacturas.id });

  await db.insert(cpDetalleFacturas).values(detalle.map((d) => ({ ...d, facturaId: factura.id })));

  revalidatePath("/control-precios");

  return { ok: true, facturaId: factura.id, pendienteRevision: facturaIncompleta, posibleDuplicado };
}

export type ItemReanalisis = {
  detalleId: number | null; // null si la IA nombró un ítem que no matchea ninguno ya guardado
  productoNombre: string;
  cantidad: number;
  precioActual: number | null;
  descuentoActual: number | null;
  subtotalActual: number | null;
  subtotalImpresoActual: number | null;
  ivaPorcentajeActual: number | null;
  precioIA: number | null;
  descuentoIA: number | null;
  subtotalIA: number | null;
  subtotalImpresoIA: number | null;
  ivaPorcentajeIA: number | null;
};

/**
 * Vuelve a mandar la MISMA foto ya guardada de una factura a la IA (usa
 * procesarComprobanteInterno(), la misma extracción de la carga original) y
 * empareja el resultado con lo que hay guardado en cp_detalle_facturas, matcheando
 * por nombre normalizado (ver normalizarNombreProducto). No escribe nada en la
 * base — es solo lectura.
 *
 * No tiene wrapper público con requerirSesion(): no hay ningún botón en la UI que
 * la dispare (el panel de "subtotal inconsistente" que la usaba se retiró — ver
 * conversación sobre FEMSA/ALDOS/proveedores que suman impuestos por renglón, algo
 * que esta función no modela). Se invoca a mano vía scripts/probar-reanalisis.ts
 * cuando hace falta auditar puntualmente la lectura de una factura puntual contra
 * la foto — mismo patrón que fusionarProveedoresInterno.
 */
export async function reanalizarFacturaInterno(
  facturaId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ejecutorInput: any = db
): Promise<ItemReanalisis[]> {
  const ejecutor = ejecutorInput as typeof db;

  const [factura] = await ejecutor.select().from(cpFacturas).where(eq(cpFacturas.id, facturaId)).limit(1);
  if (!factura) throw new Error("No se encontró la factura.");
  if (!factura.archivoUrl) throw new Error("Esta factura no tiene comprobante adjunto para reanalizar.");

  const { factura: extraida } = await procesarComprobanteInterno(factura.archivoUrl);

  const existentes = await ejecutor
    .select({
      id: cpDetalleFacturas.id,
      productoNombre: cpProductos.nombre,
      precioUnitario: cpDetalleFacturas.precioUnitario,
      descuento: cpDetalleFacturas.descuento,
      subtotal: cpDetalleFacturas.subtotal,
      subtotalImpreso: cpDetalleFacturas.subtotalImpreso,
      ivaPorcentaje: cpDetalleFacturas.ivaPorcentaje,
    })
    .from(cpDetalleFacturas)
    .innerJoin(cpProductos, eq(cpProductos.id, cpDetalleFacturas.productoId))
    .where(eq(cpDetalleFacturas.facturaId, facturaId));

  const porNombre = new Map(existentes.map((e) => [normalizarNombreProducto(e.productoNombre), e]));

  return extraida.items.map((item) => {
    const match = porNombre.get(normalizarNombreProducto(item.producto_nombre));
    // ?? en vez de asignación directa: el JSON de Gemini puede omitir una clave
    // nullable en vez de mandarla como null explícito — sin esto, ItemReanalisis
    // queda con `undefined` pese al tipo, y revienta más adelante en cualquier
    // `!== null` (ver el guardado en scripts/reanalizar-calidad-datos.ts).
    const precioIA = item.precio_unitario ?? null;
    const descuentoIA = item.descuento ?? null;
    return {
      detalleId: match?.id ?? null,
      productoNombre: item.producto_nombre,
      cantidad: item.cantidad,
      precioActual: match?.precioUnitario != null ? Number(match.precioUnitario) : null,
      descuentoActual: match?.descuento != null ? Number(match.descuento) : null,
      subtotalActual: match?.subtotal != null ? Number(match.subtotal) : null,
      subtotalImpresoActual: match?.subtotalImpreso != null ? Number(match.subtotalImpreso) : null,
      ivaPorcentajeActual: match?.ivaPorcentaje != null ? Number(match.ivaPorcentaje) : null,
      precioIA,
      descuentoIA,
      // Igual que confirmarFactura(): el subtotal "propio" siempre se calcula, no
      // se toma del papel — así esta comparación audita lo mismo que se persiste.
      subtotalIA: precioIA != null ? precioIA * item.cantidad - (descuentoIA ?? 0) : null,
      subtotalImpresoIA: item.subtotal_impreso ?? null,
      ivaPorcentajeIA: item.iva_porcentaje ?? null,
    };
  });
}

/**
 * Fusiona `duplicadoId` dentro de `canonicoId`: mueve sus productos (o los mergea si
 * ya existe un producto con el mismo nombre bajo el canónico) y sus facturas, y borra
 * el proveedor duplicado. Pasa esto casi siempre porque la IA extrae un CUIT distinto
 * (dígito mal leído) para el mismo proveedor real, o un nombre ligeramente distinto
 * cuando no hay CUIT en el ticket — ver buscarOCrearProveedor().
 */
export async function fusionarProveedores(canonicoId: number, duplicadoId: number) {
  await requerirSesion();
  await fusionarProveedoresInterno(canonicoId, duplicadoId, db);
  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/**
 * Lógica pura de la fusión, sin el chequeo de sesión — separada para que
 * scripts/probar-fusion-proveedores.ts pueda invocarla directo con una transacción
 * de prueba. requerirSesion() usa headers() de Next, que solo funciona dentro de un
 * request HTTP real, no en un script standalone.
 */
export async function fusionarProveedoresInterno(
  canonicoId: number,
  duplicadoId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ejecutorInput: any = db
) {
  // NeonHttpDatabase (uso normal, `db`) y NeonTransaction (usado por el script de
  // prueba para poder probar con ROLLBACK) exponen los mismos métodos de query
  // builder en runtime, pero son clases con distinto tipo de resultado (HKT) que TS
  // no considera mutuamente asignables — mismo tipo de escape hatch documentado que
  // el cast de Buffer en verduleria/actions.ts.
  const ejecutor = ejecutorInput as typeof db;

  if (canonicoId === duplicadoId) throw new Error("No se puede fusionar un proveedor consigo mismo.");

  const [canonico] = await ejecutor.select().from(cpProveedores).where(eq(cpProveedores.id, canonicoId)).limit(1);
  const [duplicado] = await ejecutor.select().from(cpProveedores).where(eq(cpProveedores.id, duplicadoId)).limit(1);
  if (!canonico) throw new Error("No se encontró el proveedor canónico.");
  if (!duplicado) throw new Error("No se encontró el proveedor duplicado.");

  const productosDuplicado = await ejecutor
    .select()
    .from(cpProductos)
    .where(eq(cpProductos.proveedorId, duplicadoId));

  for (const producto of productosDuplicado) {
    const [existenteEnCanonico] = await ejecutor
      .select({ id: cpProductos.id })
      .from(cpProductos)
      .where(and(eq(cpProductos.proveedorId, canonicoId), ilike(cpProductos.nombre, producto.nombre)))
      .limit(1);

    if (existenteEnCanonico) {
      // Ya hay un producto con el mismo nombre bajo el canónico — mover el detalle
      // de facturas ahí y borrar el producto duplicado (si no, quedaría huérfano al
      // borrar el proveedor, o violaría el unique index nombre+proveedor). También hay
      // que mover el vínculo de las listas de precios (vigente e histórico), o el
      // borrado revienta la FK de cp_listas_precios_proveedor/cp_listas_precios_historial
      // hacia cp_productos (caso real: producto vinculado desde una importación de lista
      // de precios, no solo desde facturas).
      await ejecutor
        .update(cpDetalleFacturas)
        .set({ productoId: existenteEnCanonico.id })
        .where(eq(cpDetalleFacturas.productoId, producto.id));
      await ejecutor
        .update(cpListasPreciosProveedor)
        .set({ productoId: existenteEnCanonico.id })
        .where(eq(cpListasPreciosProveedor.productoId, producto.id));
      await ejecutor
        .update(cpListasPreciosHistorial)
        .set({ productoId: existenteEnCanonico.id })
        .where(eq(cpListasPreciosHistorial.productoId, producto.id));
      await ejecutor.delete(cpProductos).where(eq(cpProductos.id, producto.id));
    } else {
      await ejecutor.update(cpProductos).set({ proveedorId: canonicoId }).where(eq(cpProductos.id, producto.id));
    }
  }

  await ejecutor.update(cpFacturas).set({ proveedorId: canonicoId }).where(eq(cpFacturas.proveedorId, duplicadoId));

  await ejecutor.delete(cpProveedores).where(eq(cpProveedores.id, duplicadoId));
}

/** Corrección puntual de la fecha de una factura ya confirmada — para los casos
 * donde la IA leyó mal el año/mes del ticket y recién se nota después de guardar. */
export async function corregirFechaFactura(facturaId: number, nuevaFecha: string) {
  await requerirSesion();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) throw new Error("Fecha inválida (formato YYYY-MM-DD).");

  await db.update(cpFacturas).set({ fechaEmision: nuevaFecha }).where(eq(cpFacturas.id, facturaId));

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/** Corrección puntual del monto_total de una factura — pensado para el caso de
 * obtenerFacturasPosibleDuplicado(): una página de un comprobante multipágina
 * que quedó cargada con su propio subtotal parcial en vez de $0 (solo la
 * página con el TOTAL impreso real debe quedar con monto > 0), o una factura
 * subida dos veces por error (bajar a $0 la copia de más). No borra la
 * factura ni sus ítems, solo corrige el total usado en las sumas por
 * proveedor/mes — así queda la fila como registro de que existió la carga. */
export async function corregirMontoFactura(facturaId: number, nuevoMonto: number) {
  await requerirSesion();
  if (!Number.isFinite(nuevoMonto) || nuevoMonto < 0) throw new Error("Monto inválido.");

  await db.update(cpFacturas).set({ montoTotal: nuevoMonto.toFixed(2) }).where(eq(cpFacturas.id, facturaId));

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/** Marca un caso de obtenerFacturasPosibleDuplicado() como revisado y sin
 * problema (ej. dos facturas reales distintas que coincidieron en número o
 * monto) para que deje de aparecer en el panel. No corrige ningún monto —
 * para eso está corregirMontoFactura(). facturaIds identifica el caso exacto
 * (ver comentario de cpFacturasRepetidasRevisadas en db/schema.ts). */
export async function justificarFacturasPosibleDuplicado(
  facturaIds: number[],
  proveedorId: number,
  comentario: string
) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) throw new Error("Tenés que iniciar sesión para resolver un caso.");
  const comentarioLimpio = comentario.trim();
  if (!comentarioLimpio) throw new Error("El comentario es obligatorio.");
  if (facturaIds.length < 2) throw new Error("El caso tiene que tener al menos dos facturas.");

  const clave = [...facturaIds].sort((a, b) => a - b).join(",");

  await db
    .insert(cpFacturasRepetidasRevisadas)
    .values({ proveedorId, facturaIds: clave, estado: "justificado", comentario: comentarioLimpio, usuarioEmail })
    .onConflictDoUpdate({
      target: [cpFacturasRepetidasRevisadas.facturaIds],
      set: { estado: "justificado", comentario: comentarioLimpio, usuarioEmail, creadoEn: new Date() },
    });

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

export type DatosComparacionRestaurantes = {
  productoId: number;
  localMasBaratoId: number;
  precioMinimo: number;
  fechaMasBarato: string;
  facturaIdMasBarato: number;
  localMasCaroId: number;
  precioMaximo: number;
  fechaMasCaro: string;
  facturaIdMasCaro: number;
  porcentajeDiferencia: number;
};

/** Archiva un caso de obtenerComparacionEntreRestaurantes() (mismo proveedor,
 * distinto precio entre restaurantes) para que deje de ocupar la alerta
 * principal — ver cpComparacionesRestaurantesRevisadas en db/schema.ts para el
 * criterio de "misma situación" (producto + par de locales + el precio
 * mínimo/máximo puntual que se revisó — si el precio cambia después, vuelve a
 * alertar). A diferencia de justificarFacturasPosibleDuplicado, el comentario
 * acá es opcional: no se está justificando un error, es un "ya lo vi" rápido. */
export async function confirmarComparacionRestaurantes(
  datos: DatosComparacionRestaurantes,
  comentario?: string
) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) throw new Error("Tenés que iniciar sesión para confirmar esto.");

  const localAId = Math.min(datos.localMasBaratoId, datos.localMasCaroId);
  const localBId = Math.max(datos.localMasBaratoId, datos.localMasCaroId);

  await db
    .insert(cpComparacionesRestaurantesRevisadas)
    .values({
      productoId: datos.productoId,
      localAId,
      localBId,
      localMasBaratoId: datos.localMasBaratoId,
      precioMinimo: datos.precioMinimo.toFixed(2),
      fechaMasBarato: datos.fechaMasBarato,
      facturaIdMasBarato: datos.facturaIdMasBarato,
      localMasCaroId: datos.localMasCaroId,
      precioMaximo: datos.precioMaximo.toFixed(2),
      fechaMasCaro: datos.fechaMasCaro,
      facturaIdMasCaro: datos.facturaIdMasCaro,
      porcentajeDiferencia: datos.porcentajeDiferencia.toFixed(2),
      comentario: comentario?.trim() || null,
      usuarioEmail,
    })
    .onConflictDoNothing({
      target: [
        cpComparacionesRestaurantesRevisadas.productoId,
        cpComparacionesRestaurantesRevisadas.localAId,
        cpComparacionesRestaurantesRevisadas.localBId,
        cpComparacionesRestaurantesRevisadas.precioMinimo,
        cpComparacionesRestaurantesRevisadas.precioMaximo,
      ],
    });

  revalidatePath("/control-precios/reportes");
}

/** Saca un caso del archivo de comparación entre restaurantes (por si se
 * confirmó por error) — vuelve a aparecer en la alerta activa si la
 * diferencia de precio sigue vigente. */
export async function eliminarComparacionRevisada(id: number) {
  await requerirSesion();
  await db.delete(cpComparacionesRestaurantesRevisadas).where(eq(cpComparacionesRestaurantesRevisadas.id, id));
  revalidatePath("/control-precios/reportes");
}

/** Asigna manualmente el precio de un ítem que quedó sin dato (típicamente un
 * remito de VERDULERIA sin precio impreso). Si con esto ya no queda ningún ítem
 * sin precio en esa factura, la pasa de 'pendiente_revision' a 'confirmada'. */
export async function asignarPrecioManual(detalleId: number, precio: number) {
  if (!Number.isFinite(precio) || precio <= 0) throw new Error("Precio inválido.");
  await corregirItemFacturaConfirmada(detalleId, { precioUnitario: precio });
}

export type CambiosItemFactura = {
  productoNombre?: string;
  cantidad?: number;
  // undefined = no tocar, null = volver a "sin dato" (pendiente de carga), number = fijar valor.
  precioUnitario?: number | null;
  descuento?: number | null;
};

/**
 * Corrige un ítem de una factura YA guardada (confirmada o pendiente_revision) —
 * generaliza lo que hacía asignarPrecioManual() (pensada solo para ítems sin
 * precio) para cubrir también el caso de notar un error DESPUÉS de confirmar
 * (ej. un descuento que la IA volvió a aplicarle a un producto que no lo tiene,
 * distorsionando el % de aumento en Reportes) sin tener que pedir la corrección
 * a mano en la base — ver /control-precios/facturas/[id].
 *
 * Recalcula subtotal igual que confirmarFactura()/EditorFacturaExtraida
 * (cantidad × precio_unitario − descuento) y marca precio_origen: "manual". Si
 * cambia el nombre del producto, resuelve/crea el producto correspondiente
 * dentro del MISMO proveedor de la factura (mismo buscarOCrearProducto que usa
 * la carga original) en vez de reusar el productoId actual — evita que "corregir
 * un typo" cree sin querer un ítem huérfano de otro producto.
 *
 * A diferencia de asignarPrecioManual (que solo empujaba la factura hacia
 * 'confirmada'), acá el estado se recalcula en los dos sentidos: si esta
 * corrección deja un ítem sin precio (ej. se limpió a mano), la factura vuelve a
 * 'pendiente_revision' igual que si nunca hubiera tenido precio.
 */
export async function corregirItemFacturaConfirmada(detalleId: number, cambios: CambiosItemFactura) {
  await requerirSesion();

  const [detalle] = await db
    .select({
      facturaId: cpDetalleFacturas.facturaId,
      productoId: cpDetalleFacturas.productoId,
      cantidad: cpDetalleFacturas.cantidad,
      precioUnitario: cpDetalleFacturas.precioUnitario,
      descuento: cpDetalleFacturas.descuento,
    })
    .from(cpDetalleFacturas)
    .where(eq(cpDetalleFacturas.id, detalleId))
    .limit(1);
  if (!detalle) throw new Error("No se encontró el ítem.");

  const cantidad = cambios.cantidad ?? Number(detalle.cantidad);
  const precioUnitario =
    cambios.precioUnitario !== undefined
      ? cambios.precioUnitario
      : detalle.precioUnitario !== null
        ? Number(detalle.precioUnitario)
        : null;
  const descuento =
    cambios.descuento !== undefined ? cambios.descuento : detalle.descuento !== null ? Number(detalle.descuento) : null;

  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("Cantidad inválida.");
  if (precioUnitario !== null && (!Number.isFinite(precioUnitario) || precioUnitario <= 0)) {
    throw new Error("Precio inválido.");
  }
  if (descuento !== null && (!Number.isFinite(descuento) || descuento < 0)) throw new Error("Descuento inválido.");

  let productoId = detalle.productoId;
  if (cambios.productoNombre?.trim()) {
    const [facturaDeEsteItem] = await db
      .select({ proveedorId: cpFacturas.proveedorId })
      .from(cpFacturas)
      .where(eq(cpFacturas.id, detalle.facturaId))
      .limit(1);
    if (!facturaDeEsteItem) throw new Error("No se encontró la factura del ítem.");
    productoId = await buscarOCrearProducto({
      nombre: cambios.productoNombre,
      proveedorId: facturaDeEsteItem.proveedorId,
    });
  }

  const subtotal = precioUnitario !== null ? precioUnitario * cantidad - (descuento ?? 0) : null;

  await db
    .update(cpDetalleFacturas)
    .set({
      productoId,
      cantidad: cantidad.toFixed(2),
      precioUnitario: precioUnitario !== null ? precioUnitario.toFixed(2) : null,
      descuento: descuento !== null ? descuento.toFixed(2) : null,
      subtotal: subtotal !== null ? subtotal.toFixed(2) : null,
      precioOrigen: "manual",
    })
    .where(eq(cpDetalleFacturas.id, detalleId));

  const resultado = await db.execute(sql`
    SELECT COUNT(*)::int AS pendientes FROM cp_detalle_facturas
    WHERE factura_id = ${detalle.facturaId} AND precio_unitario IS NULL
  `);
  const pendientes = (resultado.rows[0] as { pendientes: number }).pendientes;
  await db
    .update(cpFacturas)
    .set({ estado: pendientes === 0 ? "confirmada" : "pendiente_revision" })
    .where(eq(cpFacturas.id, detalle.facturaId));

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
  revalidatePath(`/control-precios/facturas/${detalle.facturaId}`);
}

export async function fusionarProductos(canonicoId: number, duplicadoId: number) {
  await requerirSesion();
  await fusionarProductosInterno(canonicoId, duplicadoId, db);
  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/** Misma lógica de fusionarProveedoresInterno, para productos duplicados dentro
 * de un mismo proveedor (ej. "Hielo x 15 kg." cargado con variantes de nombre
 * antes de fusionar los proveedores). Separada del chequeo de sesión por la misma
 * razón — ver fusionarProveedoresInterno. */
export async function fusionarProductosInterno(
  canonicoId: number,
  duplicadoId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ejecutorInput: any = db
) {
  const ejecutor = ejecutorInput as typeof db;

  if (canonicoId === duplicadoId) throw new Error("No se puede fusionar un producto consigo mismo.");

  const [canonico] = await ejecutor.select().from(cpProductos).where(eq(cpProductos.id, canonicoId)).limit(1);
  const [duplicado] = await ejecutor.select().from(cpProductos).where(eq(cpProductos.id, duplicadoId)).limit(1);
  if (!canonico) throw new Error("No se encontró el producto canónico.");
  if (!duplicado) throw new Error("No se encontró el producto duplicado.");
  if (canonico.proveedorId !== duplicado.proveedorId) {
    throw new Error("Los dos productos deben ser del mismo proveedor.");
  }

  await ejecutor
    .update(cpDetalleFacturas)
    .set({ productoId: canonicoId })
    .where(eq(cpDetalleFacturas.productoId, duplicadoId));

  // Igual que en fusionarProveedoresInterno: mover también el vínculo de las listas
  // de precios (vigente e histórico), o el borrado revienta su FK hacia cp_productos
  // cuando el duplicado está vinculado desde una importación de lista de precios.
  await ejecutor
    .update(cpListasPreciosProveedor)
    .set({ productoId: canonicoId })
    .where(eq(cpListasPreciosProveedor.productoId, duplicadoId));
  await ejecutor
    .update(cpListasPreciosHistorial)
    .set({ productoId: canonicoId })
    .where(eq(cpListasPreciosHistorial.productoId, duplicadoId));

  await ejecutor.delete(cpProductos).where(eq(cpProductos.id, duplicadoId));
}

/** Borra un ítem de detalle que no corresponde a un producto real (ej. una
 * percepción de IVA o una retención que la IA extrajo como si fuera un ítem
 * comprado) — no reajusta monto_total solo. */
export async function eliminarItemDetalle(detalleId: number) {
  await requerirSesion();
  await db.delete(cpDetalleFacturas).where(eq(cpDetalleFacturas.id, detalleId));
  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/**
 * Borra directamente una factura confirmada como copia duplicada real dentro de
 * un caso de obtenerFacturasPosibleDuplicado() — a diferencia de
 * justificarFacturasPosibleDuplicado() (que archiva el caso sin tocar datos
 * porque no es un error), acá SÍ hay un error real de carga y hace falta sacar
 * la copia de más de la base (ver scripts/limpiar-facturas-duplicadas-2026-08-07.ts,
 * que hacía esto mismo a mano antes de que existiera esta acción). Deja
 * registro en cpFacturasRepetidasRevisadas con estado "confirmado" (mismo
 * mecanismo de clave que justificarFacturasPosibleDuplicado, ver ese comentario)
 * para poder auditar después qué se borró y por qué. Borrar cp_facturas
 * cascadea a cp_detalle_facturas (onDelete: "cascade" en el schema).
 */
export async function eliminarFacturaDuplicada(
  facturaId: number,
  proveedorId: number,
  facturaIdsCaso: number[],
  comentario: string
) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) throw new Error("Tenés que iniciar sesión para eliminar una factura.");
  const comentarioLimpio = comentario.trim();
  if (!comentarioLimpio) throw new Error("El motivo del borrado es obligatorio.");
  if (facturaIdsCaso.length < 2) throw new Error("El caso tiene que tener al menos dos facturas.");
  if (!facturaIdsCaso.includes(facturaId)) throw new Error("La factura no pertenece a este caso.");

  const clave = [...facturaIdsCaso].sort((a, b) => a - b).join(",");

  await db
    .insert(cpFacturasRepetidasRevisadas)
    .values({ proveedorId, facturaIds: clave, estado: "confirmado", comentario: comentarioLimpio, usuarioEmail })
    .onConflictDoUpdate({
      target: [cpFacturasRepetidasRevisadas.facturaIds],
      set: { estado: "confirmado", comentario: comentarioLimpio, usuarioEmail, creadoEn: new Date() },
    });

  await db.delete(cpFacturas).where(eq(cpFacturas.id, facturaId));

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}

/** Clave de un grupo de posibles duplicados (proveedores o productos) — ids
 * ordenados asc y unidos por coma, igual criterio que cpFacturasRepetidasRevisadas.facturaIds
 * (ver ese comentario en db/schema.ts): si el grupo sugerido cambia de
 * composición en una corrida futura del detector, la clave ya no matchea y la
 * sugerencia vuelve a aparecer. */
function claveGrupoDuplicado(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

/** Descarta una sugerencia de agruparPosiblesDuplicados() (proveedores) — para
 * el caso de dos proveedores reales y distintos agrupados por error (ej. mismo
 * CUIT mal cargado en uno de los dos, ver cpDuplicadosDescartados en
 * db/schema.ts). No fusiona ni borra nada, solo saca el grupo del panel; si
 * además el CUIT está mal, corregirlo aparte con corregirCuitProveedor(). */
export async function descartarProveedoresDuplicados(proveedorIds: number[], comentario: string) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) throw new Error("Tenés que iniciar sesión para descartar esto.");
  const comentarioLimpio = comentario.trim();
  if (!comentarioLimpio) throw new Error("El comentario es obligatorio.");
  if (proveedorIds.length < 2) throw new Error("El grupo tiene que tener al menos dos proveedores.");

  await db
    .insert(cpDuplicadosDescartados)
    .values({
      tipo: "proveedor",
      ids: claveGrupoDuplicado(proveedorIds),
      comentario: comentarioLimpio,
      usuarioEmail,
    })
    .onConflictDoUpdate({
      target: [cpDuplicadosDescartados.tipo, cpDuplicadosDescartados.ids],
      set: { comentario: comentarioLimpio, usuarioEmail, creadoEn: new Date() },
    });

  revalidatePath("/control-precios/proveedores");
}

/** Igual que descartarProveedoresDuplicados() pero para
 * agruparPosiblesProductosDuplicados() — dos productos del mismo proveedor con
 * nombre parecido que en realidad son productos distintos. */
export async function descartarProductosDuplicados(productoIds: number[], comentario: string) {
  const session = await auth();
  const usuarioEmail = session?.user?.email;
  if (!usuarioEmail) throw new Error("Tenés que iniciar sesión para descartar esto.");
  const comentarioLimpio = comentario.trim();
  if (!comentarioLimpio) throw new Error("El comentario es obligatorio.");
  if (productoIds.length < 2) throw new Error("El grupo tiene que tener al menos dos productos.");

  await db
    .insert(cpDuplicadosDescartados)
    .values({
      tipo: "producto",
      ids: claveGrupoDuplicado(productoIds),
      comentario: comentarioLimpio,
      usuarioEmail,
    })
    .onConflictDoUpdate({
      target: [cpDuplicadosDescartados.tipo, cpDuplicadosDescartados.ids],
      set: { comentario: comentarioLimpio, usuarioEmail, creadoEn: new Date() },
    });

  revalidatePath("/control-precios/proveedores");
}

/** Corrige el CUIT de un proveedor cargado mal (causa típica de un falso
 * positivo en agruparPosiblesDuplicados() por CUIT compartido — ver caso real
 * en el comentario de cpDuplicadosDescartados en db/schema.ts). `cuit: null`
 * lo limpia (vuelve a "sin CUIT"). Mismo criterio de normalización/validación
 * que buscarOCrearProveedor(): solo dígitos, y matemáticamente válido (dígito
 * verificador AFIP) o se rechaza. */
export async function corregirCuitProveedor(proveedorId: number, cuit: string | null) {
  await requerirSesion();

  const cuitNormalizado = cuit?.trim() ? normalizarCuit(cuit) : null;
  if (cuitNormalizado && !esCuitValido(cuitNormalizado)) {
    throw new Error("El CUIT no es válido (dígito verificador incorrecto).");
  }

  try {
    await db.update(cpProveedores).set({ cuit: cuitNormalizado }).where(eq(cpProveedores.id, proveedorId));
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    if (mensaje.includes("cp_proveedores_cuit_idx")) {
      throw new Error("Ya existe otro proveedor con ese CUIT.");
    }
    throw err;
  }

  revalidatePath("/control-precios/proveedores");
  revalidatePath("/control-precios/reportes");
}
