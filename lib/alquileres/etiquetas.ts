import type { EstadoPago, SemaforoContrato } from "./status";

export const ETIQUETAS_TIPO_ALERTA: Record<string, string> = {
  vencimiento_contrato: "Vencimiento de contrato",
  decision_prorroga: "Decisión de prórroga",
  pago_pendiente: "Pago pendiente",
  pago_vencido: "Pago vencido",
  ajuste_proximo: "Ajuste de canon próximo",
  ajuste_hoy: "Ajuste de canon hoy",
  proveedor_no_mapeado: "Proveedor no mapeado",
};

export const ETIQUETAS_PRIORIDAD: Record<string, string> = {
  critica: "Crítica",
  urgente: "Urgente",
  proxima: "Próxima",
  informativa: "Informativa",
};

type ColorBadge = "rojo" | "ambar" | "verde" | "gris";

export const COLOR_PRIORIDAD: Record<string, ColorBadge> = {
  critica: "rojo",
  urgente: "ambar",
  proxima: "gris",
  informativa: "gris",
};

export const COLOR_SEMAFORO_CONTRATO: Record<SemaforoContrato, ColorBadge> = {
  "VENCIDO": "rojo",
  "CRÍTICO": "rojo",
  URGENTE: "ambar",
  "PRÓXIMO": "gris",
  VIGENTE: "verde",
  "S/F": "gris",
};

export const COLOR_ESTADO_PAGO: Record<EstadoPago, ColorBadge> = {
  PAGADO: "verde",
  PENDIENTE: "rojo",
  PARCIAL: "ambar",
  SIN_DATOS: "gris",
};

export const ETIQUETAS_ESTADO_CONTRATO: Record<string, string> = {
  vigente: "Vigente",
  historico: "Histórico",
  adenda: "Adenda",
  pendiente: "Pendiente",
};
