export interface RegistroPresentismo {
  legajo: string;
  estado: string;
}

export interface ResultadoSincronizacionRrhh {
  legajosLeidos: number;
  legajosActualizados: number;
  legajosSinCambio: number;
  legajosHuerfanos: string[];
  dryRun: boolean;
  actualizoNomina: boolean;
}
