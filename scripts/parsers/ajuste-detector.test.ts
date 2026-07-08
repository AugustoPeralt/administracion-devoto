import { test } from "node:test";
import assert from "node:assert/strict";
import { esFormulaDeAjusteManual } from "./ajuste-detector";

test("detecta el caso real de SUELDOS OPERATIVOS", () => {
  assert.equal(esFormulaDeAjusteManual("=-15399000+452000"), true);
});

test("detecta otros casos reales encontrados en los Excels", () => {
  assert.equal(esFormulaDeAjusteManual("=500000+277300"), true);
  assert.equal(esFormulaDeAjusteManual("=-14117000-733000"), true);
});

test("detecta combinaciones con espacios y decimales", () => {
  assert.equal(esFormulaDeAjusteManual("= 500000.50 + 277300.25"), true);
});

test("NO marca fórmulas estructurales de saldo acumulado", () => {
  assert.equal(esFormulaDeAjusteManual("=+E5+G4"), false);
  assert.equal(esFormulaDeAjusteManual("=E5+G4"), false);
});

test("NO marca funciones de Excel (SUM, VLOOKUP)", () => {
  assert.equal(esFormulaDeAjusteManual("=SUM(E5:E10)"), false);
  assert.equal(esFormulaDeAjusteManual('=VLOOKUP(B5,Titulares!$G$19:$K$500,5,FALSE)'), false);
  assert.equal(esFormulaDeAjusteManual("=SUBTOTAL(9,G5:G633)"), false);
});

test("NO marca un valor fijo simple (no es fórmula)", () => {
  assert.equal(esFormulaDeAjusteManual("500000"), false);
  assert.equal(esFormulaDeAjusteManual(null), false);
  assert.equal(esFormulaDeAjusteManual(undefined), false);
  assert.equal(esFormulaDeAjusteManual(""), false);
});

test("NO marca un único literal envuelto en fórmula (no hay combinación)", () => {
  assert.equal(esFormulaDeAjusteManual("=500000"), false);
  assert.equal(esFormulaDeAjusteManual("=-500000"), false);
});
