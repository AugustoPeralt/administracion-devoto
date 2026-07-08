import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAlertas } from "./alertas";
import type { Contrato, AlquilerMensual } from "./tipos";

/** Mirror de _contrato() en contratoAlquileres/tests/test_alerts.py. */
function contrato(local: string, vencimiento: string | null, estado = "Vigente"): Contrato {
  return {
    local,
    id: 1,
    estado,
    tipo: "Contrato de Locación",
    domicilio: "",
    partes: "",
    fechaContrato: null,
    vencimiento,
    plazo: "3 AÑOS",
    valorMoneda: "$100.000",
    actualizacion: "mensual ICC",
    prorroga: "1°: 3 AÑOS",
    voluntad: "Del Locatario",
    renegociacion: "",
  };
}

function sumarDiasIso(base: Date, dias: number): string {
  const d = new Date(base.getTime() + dias * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

const HOY = new Date(Date.UTC(2026, 5, 17)); // 2026-06-17, mismo HOY que test_alerts.py

test("VENCIMIENTO_CONTRATO: crítica con menos de 30 días", () => {
  const vto = sumarDiasIso(HOY, 20);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto)] }, [], {}, HOY);
  assert.ok(alertas.some((a) => a.tipoAlerta === "VENCIMIENTO_CONTRATO"));
});

test("VENCIMIENTO_CONTRATO: sin alerta fuera del umbral de 180 días", () => {
  const vto = sumarDiasIso(HOY, 200);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto)] }, [], {}, HOY);
  assert.equal(alertas.filter((a) => a.tipoAlerta === "VENCIMIENTO_CONTRATO").length, 0);
});

test("VENCIMIENTO_CONTRATO: contratos históricos no generan alerta", () => {
  const vto = sumarDiasIso(HOY, 10);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto, "Histórico")] }, [], {}, HOY);
  assert.ok(!alertas.some((a) => a.local === "TEST" && a.tipoAlerta === "VENCIMIENTO_CONTRATO"));
});

test("DECISION_PRORROGA: dispara cuando la fecha de decisión está cerca", () => {
  // fecha_decision = vto(55d) - 60d = -5d → delta=-5 <= 60 → dispara
  const vto = sumarDiasIso(HOY, 55);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto)] }, [], {}, HOY);
  assert.ok(alertas.some((a) => a.tipoAlerta === "DECISION_PRORROGA"));
});

test("DECISION_PRORROGA: no dispara con contratos lejanos", () => {
  // fecha_decision = vto(200d) - 60d = 140d → delta=140 > 60 → no dispara
  const vto = sumarDiasIso(HOY, 200);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto)] }, [], {}, HOY);
  assert.ok(!alertas.some((a) => a.tipoAlerta === "DECISION_PRORROGA"));
});

test("DECISION_PRORROGA: es CRÍTICA cuando la fecha de decisión ya pasó", () => {
  const vto = sumarDiasIso(HOY, 20); // fecha_decision = 20-60 = -40d (ya pasó)
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto)] }, [], {}, HOY);
  const prorroga = alertas.filter((a) => a.tipoAlerta === "DECISION_PRORROGA");
  assert.ok(prorroga.length > 0);
  assert.equal(prorroga[0].prioridad, "CRÍTICA");
});

test("DECISION_PRORROGA: contratos históricos no generan alerta", () => {
  const vto = sumarDiasIso(HOY, 10);
  const alertas = calcularAlertas({ TEST: [contrato("TEST", vto, "Histórico")] }, [], {}, HOY);
  assert.ok(!alertas.some((a) => a.tipoAlerta === "DECISION_PRORROGA"));
});

test("PROVEEDOR_NO_MAPEADO: se genera para locales _DESCONOCIDO_*", () => {
  const alquiler: AlquilerMensual = {
    local: "_DESCONOCIDO_Proveedor Nuevo",
    proveedorCbc: "Proveedor Nuevo",
    mes: "Jun-26",
    totalFacturado: 50_000,
    totalPagado: 0,
    saldo: 50_000,
    fechaUltimoPago: null,
    facturas: [],
    pagos: [],
  };
  const alertas = calcularAlertas({}, [alquiler], {}, HOY);
  assert.ok(alertas.some((a) => a.tipoAlerta === "PROVEEDOR_NO_MAPEADO"));
});

test("PAGO_PENDIENTE / PAGO_VENCIDO / AJUSTE_*: disparan según canon_vigente", () => {
  const alertas = calcularAlertas(
    {},
    [],
    {
      SIN_PAGO: { diaPagoDesde: 1, diaPagoHasta: 20, proximoAjuste: null, indiceAjuste: null, preavisoProrrogaDias: 30 },
      VENCIDO: { diaPagoDesde: 1, diaPagoHasta: 10, proximoAjuste: null, indiceAjuste: null, preavisoProrrogaDias: 30 },
      AJUSTE: {
        diaPagoDesde: 1,
        diaPagoHasta: 10,
        proximoAjuste: "2026-06-20",
        indiceAjuste: "ICC",
        preavisoProrrogaDias: 30,
      },
    },
    HOY // día 17: SIN_PAGO(1-20) → dentro de ventana; VENCIDO(1-10) → ventana cerrada
  );
  assert.ok(alertas.some((a) => a.local === "SIN_PAGO" && a.tipoAlerta === "PAGO_PENDIENTE"));
  assert.ok(alertas.some((a) => a.local === "VENCIDO" && a.tipoAlerta === "PAGO_VENCIDO"));
  assert.ok(alertas.some((a) => a.local === "AJUSTE" && a.tipoAlerta === "AJUSTE_PROXIMO"));
});

test("orden: CRÍTICA antes que URGENTE antes que PRÓXIMA antes que INFORMATIVA", () => {
  const orden: Record<string, number> = { "CRÍTICA": 0, URGENTE: 1, "PRÓXIMA": 2, INFORMATIVA: 3 };
  const alertas = calcularAlertas(
    {
      A: [contrato("A", sumarDiasIso(HOY, 200))], // sin alerta
      B: [contrato("B", sumarDiasIso(HOY, 20))], // CRÍTICA
      C: [contrato("C", sumarDiasIso(HOY, 70))], // URGENTE
    },
    [
      {
        local: "_DESCONOCIDO_X",
        proveedorCbc: "X",
        mes: "Jun-26",
        totalFacturado: 1,
        totalPagado: 0,
        saldo: 1,
        fechaUltimoPago: null,
        facturas: [],
        pagos: [],
      },
    ],
    {},
    HOY
  );
  for (let i = 1; i < alertas.length; i++) {
    assert.ok(orden[alertas[i - 1].prioridad] <= orden[alertas[i].prioridad], "las alertas deben venir ordenadas por prioridad");
  }
});
