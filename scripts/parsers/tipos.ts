export interface MovimientoParseado {
  filaExcel: number;
  fecha: string; // ISO YYYY-MM-DD
  codTitular: number | null;
  titularResuelto: string | null;
  codCuenta: number | null;
  cuentaResuelta: string | null;
  conceptoManual: string | null;
  descripcionFinal: string;
  montoArs: number;
  montoUsd: number | null;
  tipoMovimiento: "ingreso" | "egreso";
  saldoAcumuladoArs: number;
  saldoAcumuladoUsd: number;
  formulaOriginal: string | null;
  requiereJustificacion: boolean;
  anomalia: string | null;
  colorFondo: string | null;
}

export interface FilaDescartada {
  fila: number;
  motivo: string;
}

export interface ResultadoParseoHoja {
  movimientos: MovimientoParseado[];
  filaTotales: number | null;
  filasDescartadas: FilaDescartada[];
  saldoInicialArs: number;
  saldoInicialUsd: number;
  totalSegunExcelArs: number | null;
  totalSegunExcelUsd: number | null;
}
