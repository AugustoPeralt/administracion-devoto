import { test } from "node:test";
import assert from "node:assert/strict";
import {
  precioRealAjustado,
  parseLocalIds,
  agruparPosiblesDuplicados,
  agruparPosiblesProductosDuplicados,
  fusionarGruposPorIdsComunes,
  overlapMaximoDeItems,
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

function proveedor(id: number, nombre: string, cuit: string | null = null): ProveedorConTotales {
  return { id, nombre, categoria: "ALMACEN", cuit, facturas: 0, total: 0 };
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

test("agruparPosiblesDuplicados: agrupa por CUIT igual aunque el formato difiera y el nombre no matchee", () => {
  const grupos = agruparPosiblesDuplicados([
    proveedor(1, "Coca-Cola FEMSA S.A.", "30-12345678-9"),
    proveedor(2, "FEMSA Distribución", "30123456789"), // mismo CUIT, sin guiones, nombre distinto
    proveedor(3, "Otro Proveedor SRL", "20-99999999-1"),
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(
    grupos[0].map((p) => p.id).sort(),
    [1, 2]
  );
});

test("agruparPosiblesDuplicados: une un grupo por nombre y un grupo por CUIT cuando comparten un id", () => {
  const grupos = agruparPosiblesDuplicados([
    proveedor(1, "AAA Distribuidora SRL", "30-11111111-1"),
    proveedor(2, "BBB Insumos SRL", "30111111111"), // nombre distinto a los otros dos, mismo CUIT que 1 (sin guiones)
    proveedor(3, "AAA Distribuidora SRL", null), // mismo nombre que 1, sin CUIT
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(
    grupos[0].map((p) => p.id).sort(),
    [1, 2, 3]
  );
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

test("fusionarGruposPorIdsComunes: une grupos que comparten al menos un id", () => {
  const clusters = fusionarGruposPorIdsComunes([
    [1, 2],
    [2, 3],
    [5, 6],
  ]);
  assert.equal(clusters.length, 2);
  const ordenados = clusters.map((c) => [...c].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(ordenados, [
    [1, 2, 3],
    [5, 6],
  ]);
});

test("fusionarGruposPorIdsComunes: grupos sin ids en común quedan separados", () => {
  const clusters = fusionarGruposPorIdsComunes([
    [10, 11],
    [20, 21],
  ]);
  assert.equal(clusters.length, 2);
});

test("fusionarGruposPorIdsComunes: un id puede unir tres grupos distintos en uno solo", () => {
  const clusters = fusionarGruposPorIdsComunes([
    [1, 2],
    [3, 4],
    [2, 3],
  ]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0], [1, 2, 3, 4]);
});

test("overlapMaximoDeItems: 100% cuando dos facturas tienen exactamente los mismos ítems", () => {
  const items = new Map([
    [1, ["Yerba|1|2000", "Sal|2|500"]],
    [2, ["Yerba|1|2000", "Sal|2|500"]],
  ]);
  assert.equal(overlapMaximoDeItems(items, [1, 2]), 100);
});

test("overlapMaximoDeItems: 0% cuando dos facturas no comparten ningún ítem (caso real: dos páginas de un mismo comprobante)", () => {
  const items = new Map([
    [1, ["Aceite|12|3070.01", "Arroz|1|7806.28"]],
    [2, ["Te|1|2185.74", "Yerba|1|2882.67"]],
  ]);
  assert.equal(overlapMaximoDeItems(items, [1, 2]), 0);
});

test("overlapMaximoDeItems: usa el máximo par dentro de un grupo de más de 2 facturas", () => {
  const items = new Map([
    [1, ["A|1|10"]],
    [2, ["B|1|20"]],
    [3, ["A|1|10"]], // igual a la factura 1
  ]);
  assert.equal(overlapMaximoDeItems(items, [1, 2, 3]), 100);
});

test("overlapMaximoDeItems: factura sin ítems no rompe el cálculo", () => {
  const items = new Map([
    [1, ["A|1|10"]],
    [2, [] as string[]],
  ]);
  assert.equal(overlapMaximoDeItems(items, [1, 2]), 0);
});
