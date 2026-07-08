import { test } from "node:test";
import assert from "node:assert/strict";
import { semaforoContrato, estadoPago } from "./status";

test("semaforoContrato: mirror de _contrato_status en dashboard.py", () => {
  assert.equal(semaforoContrato(null), "S/F");
  assert.equal(semaforoContrato(-1), "VENCIDO");
  assert.equal(semaforoContrato(0), "CRÍTICO");
  assert.equal(semaforoContrato(30), "CRÍTICO");
  assert.equal(semaforoContrato(31), "URGENTE");
  assert.equal(semaforoContrato(90), "URGENTE");
  assert.equal(semaforoContrato(91), "PRÓXIMO");
  assert.equal(semaforoContrato(180), "PRÓXIMO");
  assert.equal(semaforoContrato(181), "VIGENTE");
});

test("estadoPago: mirror de _pago_info en dashboard.py", () => {
  assert.equal(estadoPago(0, 0, 0), "SIN_DATOS");
  assert.equal(estadoPago(100, 100, 0), "PAGADO");
  assert.equal(estadoPago(100, 0, 100), "PENDIENTE");
  assert.equal(estadoPago(100, 50, 50), "PARCIAL");
});
