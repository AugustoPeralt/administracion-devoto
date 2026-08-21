import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parsearListaElEmporio } from "./listas-precios";

function armarBuffer(filas: unknown[][]): Buffer {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, hoja, "lista");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("parsearListaElEmporio: formato 2026-08 con columna Unidades y precios con símbolo $", () => {
  const buffer = armarBuffer([
    ["Articulo", "Titulo", "Desacripcion", "Unidades", " Precio ", " Precio con bonificacion ", "% IVA"],
    ["AL01009", "ACEITE MEZ 1.5L SOJA-GIR COCINERO", "12x1.5LT-SOJA/GIRAS Sin Gluten", "UNI", " $ 4,532.00 ", " $ 4,078.80 ", "21.00"],
  ]);

  const filas = parsearListaElEmporio(buffer);

  assert.equal(filas.length, 1);
  assert.deepEqual(filas[0], {
    codigoProveedor: "AL01009",
    descripcion: "ACEITE MEZ 1.5L SOJA-GIR COCINERO",
    presentacion: "12x1.5LT-SOJA/GIRAS Sin Gluten",
    categoria: null,
    precioLista: 4532,
    precioConBonificacion: 4078.8,
  });
});
