import { test } from "node:test";
import assert from "node:assert/strict";
import {
  precioRealAjustado,
  parseLocalIds,
  agruparPosiblesDuplicados,
  agruparPosiblesProductosDuplicados,
  type ProveedorConTotales,
  type ProductoConTotales,
} from "./consultas";
import { NOMBRE_PROVEEDOR_EL_CRIOLLO, NOMBRE_PROVEEDOR_HORECA, FACTOR_PRECIO_REAL_ADICIONAL } from "./constantes";

test("precioRealAjustado: aplica el factor 10%+6% a El Criollo y HORECA", () => {
  assert.equal(precioRealAjustado(NOMBRE_PROVEEDOR_EL_CRIOLLO, 100), 100 * FACTOR_PRECIO_REAL_ADICIONAL);
  assert.equal(precioRealAjustado(NOMBRE_PROVEEDOR_HORECA, 100), 100 * FACTOR_PRECIO_REAL_ADICIONAL);
});

test("precioRealAjustado: no toca el precio de proveedores sin ese mecanismo (ej. FEMSA)", () => {
  assert.equal(precioRealAjustado("FEMSA", 100), 100);
  assert.equal(precioRealAjustado("El Emporio de Lanús S.A.", 250.5), 250.5);
});

test("parseLocalIds: ausente o vacío significa 'todos los restaurantes' (undefined)", () => {
  assert.equal(parseLocalIds(null), undefined);
  assert.equal(parseLocalIds(undefined), undefined);
  assert.equal(parseLocalIds(""), undefined);
});

test("parseLocalIds: parsea ids separados por coma y descarta tokens no numéricos", () => {
  assert.deepEqual(parseLocalIds("7,8"), [7, 8]);
  assert.deepEqual(parseLocalIds("7, abc ,8"), [7, 8]);
});

test("parseLocalIds: solo tokens basura también cae en 'todos' (undefined)", () => {
  assert.equal(parseLocalIds("abc,def"), undefined);
});

function proveedor(id: number, nombre: string): ProveedorConTotales {
  return { id, nombre, categoria: "ALMACEN", cuit: null, facturas: 0, total: 0 };
}

test("agruparPosiblesDuplicados: agrupa proveedores con nombre similar", () => {
  const grupos = agruparPosiblesDuplicados([
    proveedor(1, "Distribuidora El Criollo SRL"),
    proveedor(2, "El Criollo"),
    proveedor(3, "El Emporio de Lanús S.A."),
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(
    grupos[0].map((p) => p.id).sort(),
    [1, 2]
  );
});

test("agruparPosiblesDuplicados: no arma grupos de un solo elemento (no hay duplicado real)", () => {
  const grupos = agruparPosiblesDuplicados([proveedor(1, "El Emporio de Lanús S.A.")]);
  assert.equal(grupos.length, 0);
});

function producto(id: number, nombre: string, proveedorId: number): ProductoConTotales {
  return { id, nombre, proveedorId, proveedorNombre: "x", unidadMedida: "kg", facturas: 0 };
}

test("agruparPosiblesProductosDuplicados: agrupa solo dentro del mismo proveedor", () => {
  const grupos = agruparPosiblesProductosDuplicados([
    producto(1, "Hielo x 15 kg.", 100),
    producto(2, "hielo x 15   kg", 100), // misma variante, solo cambia mayúsculas/espacios/puntuación
    producto(3, "Hielo x 15 kg.", 200), // mismo nombre, OTRO proveedor: no es duplicado
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(
    grupos[0].map((p) => p.id).sort(),
    [1, 2]
  );
});
