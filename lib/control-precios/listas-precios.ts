import * as XLSX from "xlsx";

export type FilaListaPrecio = {
  codigoProveedor: string;
  descripcion: string;
  presentacion: string | null;
  categoria: string | null;
  precioLista: number;
  precioConBonificacion: number | null;
};

function limpiarTexto(valor: unknown): string {
  return (valor ?? "").toString().trim();
}

/** "4,532.00" o "4078.8" -> 4532 / 4078.8. Las listas de proveedores vienen con
 * la coma de miles a veces sí, a veces no (ver LISTA 23-7.xlsx: la columna
 * "Precio" siempre la tiene, "precio c/bonif" no) — sacarla siempre es seguro
 * porque ningún precio de estos catálogos usa coma como separador decimal. */
function parsearPrecio(valor: unknown): number {
  const texto = limpiarTexto(valor).replace(/,/g, "");
  return texto ? Number(texto) : NaN;
}

function leerFilas(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" }) as unknown[][];
}

/**
 * El Emporio de Lanús S.A. — lista plana, sin secciones: fila 0 es encabezado
 * ("Cód. artículo", "Descripción", "Desc. Adicional", "Precio", "precio
 * c/bonif"), el resto son productos. "precio c/bonif" es el precio final
 * negociado (confirmado por el usuario) — se usa directo para comparar, sin
 * ningún ajuste adicional.
 */
export function parsearListaElEmporio(buffer: Buffer): FilaListaPrecio[] {
  const filas = leerFilas(buffer);
  const resultado: FilaListaPrecio[] = [];

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    const codigoProveedor = limpiarTexto(fila[0]);
    const descripcion = limpiarTexto(fila[1]);
    if (!codigoProveedor || !descripcion) continue;

    const precioLista = parsearPrecio(fila[3]);
    if (!Number.isFinite(precioLista)) continue;

    const precioConBonificacion = parsearPrecio(fila[4]);
    resultado.push({
      codigoProveedor,
      descripcion,
      presentacion: limpiarTexto(fila[2]) || null,
      categoria: null,
      precioLista,
      precioConBonificacion: Number.isFinite(precioConBonificacion) ? precioConBonificacion : null,
    });
  }

  return resultado;
}

/**
 * Distribuidora El Criollo SRL — catálogo con secciones intercaladas: una fila
 * de categoría (ej. "QUESOS") que ocupa solo la primera columna, seguida de
 * las filas de producto de esa sección (código, descripción, unidad, precio).
 * No tiene fila de encabezado — la primera fila ya es la primera sección. El
 * precio de esta lista es el de LISTA, sin el 10% de descuento que sí aplica
 * en la factura real — ver DESCUENTO_LISTA_EL_CRIOLLO en constantes.ts, se
 * aplica recién al comparar, no acá.
 */
export function parsearListaElCriollo(buffer: Buffer): FilaListaPrecio[] {
  const filas = leerFilas(buffer);
  const resultado: FilaListaPrecio[] = [];
  let categoriaActual: string | null = null;

  for (const fila of filas) {
    const c0 = limpiarTexto(fila[0]);
    const c1 = limpiarTexto(fila[1]);
    const c2 = limpiarTexto(fila[2]);
    const c3 = limpiarTexto(fila[3]);

    if (!c0 && !c1) continue; // fila en blanco

    // Fila de sección: solo la primera columna tiene texto (no numérico) y el
    // resto está vacío — un código de producto real siempre es numérico.
    if (c0 && !c1 && !c2 && !c3 && Number.isNaN(Number(c0))) {
      categoriaActual = c0;
      continue;
    }

    if (!c0 || !c1) continue;
    const precioLista = parsearPrecio(fila[3]);
    if (!Number.isFinite(precioLista)) continue;

    resultado.push({
      codigoProveedor: c0,
      descripcion: c1,
      presentacion: c2 || null,
      categoria: categoriaActual,
      precioLista,
      precioConBonificacion: null,
    });
  }

  return resultado;
}
