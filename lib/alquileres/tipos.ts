/** Mapea 1:1 los dataclasses de contratoAlquileres/src/models.py. Fechas como
 * string ISO "YYYY-MM-DD" (o null), mismo criterio que scripts/parsers/tipos.ts. */

export interface Factura {
  fecha: string | null;
  razonSocial: string;
  cuit: string;
  monto: number;
  tipoComprobante: number;
}

export interface Pago {
  fecha: string | null;
  monto: number;
  medio: string;
  nroCheque: string;
}

export interface AlquilerMensual {
  local: string;
  proveedorCbc: string;
  mes: string;
  totalFacturado: number;
  totalPagado: number;
  saldo: number;
  fechaUltimoPago: string | null;
  facturas: Factura[];
  pagos: Pago[];
}

/** `estado` ya normalizado: "Vigente" | "Histórico" | "Adenda" | "Pendiente". */
export interface Contrato {
  local: string;
  id: number;
  estado: string;
  tipo: string;
  domicilio: string;
  partes: string;
  fechaContrato: string | null;
  vencimiento: string | null;
  plazo: string;
  valorMoneda: string;
  actualizacion: string;
  prorroga: string;
  voluntad: string;
  renegociacion: string;
}

/** `prioridad`: "CRÍTICA" | "URGENTE" | "PRÓXIMA" | "INFORMATIVA". */
export interface Alerta {
  prioridad: string;
  local: string;
  tipoAlerta: string;
  descripcion: string;
  fechaEvento: string | null;
  diasRestantes: number | null;
  accionRequerida: string;
}

/** Shape de una entrada de canon_vigente (alerts.py), una por local. */
export interface CanonVigenteLocal {
  diaPagoDesde: number;
  diaPagoHasta: number;
  proximoAjuste: string | null;
  indiceAjuste: string | null;
  preavisoProrrogaDias: number;
}

export type CanonVigenteConfig = Record<string, CanonVigenteLocal>;
