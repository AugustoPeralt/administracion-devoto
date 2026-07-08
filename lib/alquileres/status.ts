/**
 * Porta la lógica de semáforos de contratoAlquileres/src/dashboard.py
 * (_contrato_status / _pago_info) — solo la clasificación semántica, sin los
 * estilos de Excel (PatternFill/Font), que en Fase 5 se reemplazan por el
 * componente Badge existente (components/Badge.tsx).
 */

export type SemaforoContrato = "S/F" | "VENCIDO" | "CRÍTICO" | "URGENTE" | "PRÓXIMO" | "VIGENTE";

/** Semáforo de vencimiento de contrato según días restantes (null = sin fecha). */
export function semaforoContrato(deltaDias: number | null): SemaforoContrato {
  if (deltaDias === null) return "S/F";
  if (deltaDias < 0) return "VENCIDO";
  if (deltaDias <= 30) return "CRÍTICO";
  if (deltaDias <= 90) return "URGENTE";
  if (deltaDias <= 180) return "PRÓXIMO";
  return "VIGENTE";
}

export type EstadoPago = "SIN_DATOS" | "PAGADO" | "PENDIENTE" | "PARCIAL";

/** Estado de pago de un AlquilerMensual según facturado/pagado/saldo. */
export function estadoPago(totalFacturado: number, totalPagado: number, saldo: number): EstadoPago {
  if (totalFacturado === 0 && totalPagado === 0) return "SIN_DATOS";
  if (saldo === 0) return "PAGADO";
  if (totalPagado === 0) return "PENDIENTE";
  return "PARCIAL";
}
