import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tipoCajaEnum = pgEnum("tipo_caja", ["operativa", "obra"]);
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", ["ingreso", "egreso"]);
export const rolUsuarioEnum = pgEnum("rol_usuario", ["admin", "viewer"]);
export const accionCargaEnum = pgEnum("accion_carga", [
  "importado",
  "descartado",
  "marcado_revision",
]);
export const estadoDuplicadoEnum = pgEnum("estado_duplicado", ["confirmado", "justificado"]);

// ─── Alquileres ──────────────────────────────────────────────────────────────
// Prefijo "alq" para separar claramente del dominio de Consolidados (arriba).
// Mapea 1:1 los dataclasses de contratoAlquileres/src/models.py.

export const alqEstadoContratoEnum = pgEnum("alq_estado_contrato", [
  "vigente",
  "historico",
  "adenda",
  "pendiente",
]);
export const alqPrioridadAlertaEnum = pgEnum("alq_prioridad_alerta", [
  "critica",
  "urgente",
  "proxima",
  "informativa",
]);
export const alqTipoAlertaEnum = pgEnum("alq_tipo_alerta", [
  "vencimiento_contrato",
  "decision_prorroga",
  "pago_pendiente",
  "pago_vencido",
  "ajuste_proximo",
  "ajuste_hoy",
  "proveedor_no_mapeado",
]);
export const alqEstadoSyncEnum = pgEnum("alq_estado_sync", [
  "en_curso",
  "completado",
  "con_errores",
]);

export const cajas = pgTable(
  "cajas",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    tipo: tipoCajaEnum("tipo").notNull(),
    archivoOrigen: text("archivo_origen").notNull(),
  },
  (t) => [uniqueIndex("cajas_nombre_archivo_idx").on(t.nombre, t.archivoOrigen)]
);

export const titulares = pgTable(
  "titulares",
  {
    id: serial("id").primaryKey(),
    archivoOrigen: text("archivo_origen").notNull(),
    cod: integer("cod").notNull(),
    nombre: text("nombre").notNull(),
    grupo1: text("grupo1"),
    grupo2: text("grupo2"),
    grupo3: text("grupo3"),
    razonSocial: text("razon_social"),
    cuit: text("cuit"),
    telefono: text("telefono"),
  },
  (t) => [uniqueIndex("titulares_archivo_cod_idx").on(t.archivoOrigen, t.cod)]
);

export const planCuentas = pgTable(
  "plan_cuentas",
  {
    id: serial("id").primaryKey(),
    cod: integer("cod").notNull(),
    grupo: text("grupo"),
    rubro: text("rubro"),
    subrubro: text("subrubro"),
    cuenta: text("cuenta").notNull(),
  },
  (t) => [uniqueIndex("plan_cuentas_cod_idx").on(t.cod)]
);

export const movimientosCaja = pgTable(
  "movimientos_caja",
  {
    id: serial("id").primaryKey(),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    archivoOrigen: text("archivo_origen").notNull(),
    filaExcel: integer("fila_excel").notNull(),
    fecha: date("fecha").notNull(),
    codTitular: integer("cod_titular"),
    titularResuelto: text("titular_resuelto"),
    codCuenta: integer("cod_cuenta"),
    cuentaResuelta: text("cuenta_resuelta"),
    conceptoManual: text("concepto_manual"),
    descripcionFinal: text("descripcion_final").notNull(),
    montoArs: numeric("monto_ars", { precision: 18, scale: 2 }).notNull(),
    montoUsd: numeric("monto_usd", { precision: 18, scale: 2 }),
    tipoMovimiento: tipoMovimientoEnum("tipo_movimiento").notNull(),
    saldoAcumuladoArs: numeric("saldo_acumulado_ars", { precision: 18, scale: 2 }),
    saldoAcumuladoUsd: numeric("saldo_acumulado_usd", { precision: 18, scale: 2 }),
    formulaOriginal: text("formula_original"),
    requiereJustificacion: boolean("requiere_justificacion").notNull().default(false),
    esSaldoInicial: boolean("es_saldo_inicial").notNull().default(false),
    anomalia: text("anomalia"),
    colorFondo: text("color_fondo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("movimientos_natural_key_idx").on(t.archivoOrigen, t.cajaId, t.filaExcel),
  ]
);

export const justificacionesAuditoria = pgTable(
  "justificaciones_auditoria",
  {
    id: serial("id").primaryKey(),
    movimientoId: integer("movimiento_id")
      .notNull()
      .references(() => movimientosCaja.id),
    usuarioEmail: text("usuario_email").notNull(),
    comentario: text("comentario").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
  },
  (t) => [uniqueIndex("justificaciones_movimiento_idx").on(t.movimientoId)]
);

export const registroAuditoria = pgTable("registro_auditoria", {
  id: serial("id").primaryKey(),
  archivo: text("archivo").notNull(),
  hashArchivo: text("hash_archivo").notNull(),
  fechaModificacionSharepoint: timestamp("fecha_modificacion_sharepoint", { withTimezone: true }),
  modificadoPorSharepoint: text("modificado_por_sharepoint"),
  hoja: text("hoja"),
  filaExcel: integer("fila_excel"),
  tipoAnomalia: text("tipo_anomalia"),
  accionTomada: accionCargaEnum("accion_tomada").notNull(),
  fechaCarga: timestamp("fecha_carga", { withTimezone: true }).notNull().defaultNow(),
});

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  nombre: text("nombre"),
  rol: rolUsuarioEnum("rol").notNull().default("viewer"),
});

/**
 * Comparación, por caja, entre el saldo recalculado a partir de los movimientos
 * importados y el último valor de la columna "TOTAL $"/"TOTAL USD" que muestra el
 * propio Excel. No es para "corregir" el Excel: es para exponer cuando el Excel
 * tiene un error de fórmula (ej. copiar/pegar entre hojas) y que quede visible para
 * que la dirección lo revise en el archivo original.
 */
export const consistenciaSaldos = pgTable(
  "consistencia_saldos",
  {
    id: serial("id").primaryKey(),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    saldoCalculadoArs: numeric("saldo_calculado_ars", { precision: 18, scale: 2 }).notNull(),
    saldoExcelArs: numeric("saldo_excel_ars", { precision: 18, scale: 2 }),
    diferenciaArs: numeric("diferencia_ars", { precision: 18, scale: 2 }),
    saldoCalculadoUsd: numeric("saldo_calculado_usd", { precision: 18, scale: 2 }).notNull(),
    saldoExcelUsd: numeric("saldo_excel_usd", { precision: 18, scale: 2 }),
    diferenciaUsd: numeric("diferencia_usd", { precision: 18, scale: 2 }),
    filaTotalesEncontrada: boolean("fila_totales_encontrada").notNull().default(false),
    verificadoEn: timestamp("verificado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("consistencia_saldos_caja_idx").on(t.cajaId)]
);

/**
 * Pagos recurrentes que se esperan todos los meses en una caja (alquiler, sueldos,
 * sistemas, etc.). Se identifican por el código de titular o de cuenta que usa esa
 * caja en el Excel (columna COD), no por texto — el texto de la descripción varía
 * demasiado entre cargas ("ALQUILER LOCAL", "Alquiler local mes junio", ...) para
 * matchear de forma confiable. Cada regla exige exactamente uno de los dos códigos.
 */
export const conceptosEsperados = pgTable("conceptos_esperados", {
  id: serial("id").primaryKey(),
  cajaId: integer("caja_id")
    .notNull()
    .references(() => cajas.id),
  nombre: text("nombre").notNull(),
  codTitular: integer("cod_titular"),
  codCuenta: integer("cod_cuenta"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Excepción al criterio de conceptosEsperados (que evita matchear por texto a
 * propósito): los alquileres pagados en efectivo comparten TODOS el mismo
 * cod_titular=3 ("ALQUILER LOCAL"/"Sin Titular 3" en el catálogo, genérico) — una
 * misma caja puede tener varios alquileres reales distintos bajo ese único código
 * (ej. TAVLON: Ferretería/Canone/Jakim), así que el código solo no alcanza para
 * separarlos. Acá sí se matchea por texto libre (palabrasClave, separadas por
 * coma, case-insensitive, contra descripcion_final/concepto_manual) porque no hay
 * otra forma de distinguirlos. Un movimiento cod=3 que no matchea ninguna palabra
 * clave activa se muestra igual como "sin clasificar" — nunca se pierde en
 * silencio por un keyword mal tipeado.
 */
export const alquileresEfectivo = pgTable(
  "alquileres_efectivo",
  {
    id: serial("id").primaryKey(),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    nombre: text("nombre").notNull(),
    codTitular: integer("cod_titular").notNull().default(3),
    palabrasClave: text("palabras_clave").notNull(),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alquileres_efectivo_caja_nombre_idx").on(t.cajaId, t.nombre)]
);

/**
 * Resolución de un caso de "posible duplicado" (mismo concepto, misma caja, misma
 * fecha, cargado más de una vez en filas separadas de la hoja — ver detección en
 * obtenerPosiblesDuplicados). Se identifica por (caja, fecha, código de titular),
 * no por movimiento individual, porque el caso involucra a todo el grupo repetido.
 */
export const duplicadosRevisados = pgTable(
  "duplicados_revisados",
  {
    id: serial("id").primaryKey(),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    fecha: date("fecha").notNull(),
    codTitular: integer("cod_titular").notNull(),
    estado: estadoDuplicadoEnum("estado").notNull(),
    comentario: text("comentario").notNull(),
    usuarioEmail: text("usuario_email").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("duplicados_caso_idx").on(t.cajaId, t.fecha, t.codTitular)]
);

// ─── Alquileres ──────────────────────────────────────────────────────────────

/** Catálogo de locales reales (restaurantes). Nombre canónico usado como referencia
 * por contratos, mapeos de proveedor CBC y canon vigente. */
export const alqLocales = pgTable("alq_locales", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Mapea models.Contrato del sistema Python. `contratoIdExcel` es el ID tal como
 * figura en la columna A del Excel maestro (numeración propia de cada hoja/local,
 * no global) — la clave natural es (local, contratoIdExcel). */
export const alqContratos = pgTable(
  "alq_contratos",
  {
    id: serial("id").primaryKey(),
    localId: integer("local_id")
      .notNull()
      .references(() => alqLocales.id),
    contratoIdExcel: integer("contrato_id_excel").notNull(),
    estado: alqEstadoContratoEnum("estado").notNull(),
    tipo: text("tipo"),
    domicilio: text("domicilio"),
    partes: text("partes"),
    fechaContrato: date("fecha_contrato"),
    vencimiento: date("vencimiento"),
    plazo: text("plazo"),
    valorMoneda: text("valor_moneda"),
    actualizacion: text("actualizacion"),
    prorroga: text("prorroga"),
    voluntad: text("voluntad"),
    renegociacion: text("renegociacion"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
  },
  (t) => [uniqueIndex("alq_contratos_local_id_excel_idx").on(t.localId, t.contratoIdExcel)]
);

/** Mapea AlquilerMensual. `local` es texto libre (no FK) porque puede ser un
 * pseudo-local del parser ("_DESCONOCIDO_<proveedor>", "_OFICINA_ADMIN") además
 * de un nombre de `alqLocales` real — mismo criterio que usa cbc_parser.py. */
export const alqAlquileresMensuales = pgTable(
  "alq_alquileres_mensuales",
  {
    id: serial("id").primaryKey(),
    local: text("local").notNull(),
    proveedorCbc: text("proveedor_cbc").notNull(),
    mes: text("mes").notNull(),
    totalFacturado: numeric("total_facturado", { precision: 18, scale: 2 }).notNull(),
    totalPagado: numeric("total_pagado", { precision: 18, scale: 2 }).notNull(),
    saldo: numeric("saldo", { precision: 18, scale: 2 }).notNull(),
    fechaUltimoPago: date("fecha_ultimo_pago"),
    syncRunId: integer("sync_run_id").references(() => alqSyncRuns.id),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alq_alquileres_local_mes_idx").on(t.local, t.mes)]
);

/** Mapea Factura (hijo de AlquilerMensual). */
export const alqFacturas = pgTable("alq_facturas", {
  id: serial("id").primaryKey(),
  alquilerMensualId: integer("alquiler_mensual_id")
    .notNull()
    .references(() => alqAlquileresMensuales.id),
  fecha: date("fecha").notNull(),
  razonSocial: text("razon_social").notNull(),
  cuit: text("cuit").notNull(),
  monto: numeric("monto", { precision: 18, scale: 2 }).notNull(),
  tipoComprobante: integer("tipo_comprobante").notNull(),
});

/** Mapea Pago (hijo de AlquilerMensual). */
export const alqPagos = pgTable("alq_pagos", {
  id: serial("id").primaryKey(),
  alquilerMensualId: integer("alquiler_mensual_id")
    .notNull()
    .references(() => alqAlquileresMensuales.id),
  fecha: date("fecha").notNull(),
  monto: numeric("monto", { precision: 18, scale: 2 }).notNull(),
  medio: text("medio").notNull(),
  nroCheque: text("nro_cheque"),
});

/** Reemplaza el `canon_vigente = {}` hardcodeado en src/main.py — activa las
 * alertas PAGO_PENDIENTE/PAGO_VENCIDO/AJUSTE_PROXIMO/AJUSTE_HOY. Editable desde
 * app/alquileres/canon. Shape según alerts.py: dia_pago_desde/hasta, proximo_ajuste,
 * indice_ajuste, preaviso_prorroga_dias. */
export const alqCanonVigenteConfig = pgTable("alq_canon_vigente_config", {
  id: serial("id").primaryKey(),
  local: text("local").notNull().unique(),
  diaPagoDesde: integer("dia_pago_desde").notNull().default(1),
  diaPagoHasta: integer("dia_pago_hasta").notNull().default(10),
  proximoAjuste: date("proximo_ajuste"),
  indiceAjuste: text("indice_ajuste"),
  preavisoProrrogaDias: integer("preaviso_prorroga_dias").notNull().default(30),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Snapshot de alertas persistido en cada sincronización — la web solo lee,
 * nunca recalcula (mismas 7 combinaciones prioridad/tipo que src/alerts.py). */
export const alqAlertas = pgTable("alq_alertas", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id")
    .notNull()
    .references(() => alqSyncRuns.id),
  prioridad: alqPrioridadAlertaEnum("prioridad").notNull(),
  local: text("local").notNull(),
  tipoAlerta: alqTipoAlertaEnum("tipo_alerta").notNull(),
  descripcion: text("descripcion").notNull(),
  fechaEvento: date("fecha_evento"),
  diasRestantes: integer("dias_restantes"),
  accionRequerida: text("accion_requerida").notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Reemplaza config/locales_mapping.json (proveedor CBC → local canónico).
 * `localCanonico` es texto libre (no FK a alqLocales) porque el JSON original
 * admite pseudo-locales como "_OFICINA_ADMIN". Mismo patrón que conceptosEsperados
 * + su pantalla de reglas. */
export const alqLocalesMapping = pgTable("alq_locales_mapping", {
  id: serial("id").primaryKey(),
  proveedorCbc: text("proveedor_cbc").notNull().unique(),
  localCanonico: text("local_canonico").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Metadata (no el binario) de la futura carpeta de solo lectura con los contratos
 * reales. Queda lista pero inactiva hasta que se confirme la ruta de SharePoint. */
export const alqDocumentos = pgTable("alq_documentos", {
  id: serial("id").primaryKey(),
  localId: integer("local_id").references(() => alqLocales.id),
  nombre: text("nombre").notNull(),
  webUrl: text("web_url").notNull(),
  sharepointPath: text("sharepoint_path").notNull(),
  driveItemId: text("drive_item_id"),
  tamanioBytes: integer("tamanio_bytes"),
  modificadoEn: timestamp("modificado_en", { withTimezone: true }),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Reemplaza el rol de "aviso de errores" que hoy cumple el email semanal
 * (weekly_scan.yml + email_builder.py): estado de cada sincronización, CBCs
 * fallidos, etc. */
export const alqSyncRuns = pgTable("alq_sync_runs", {
  id: serial("id").primaryKey(),
  iniciadoEn: timestamp("iniciado_en", { withTimezone: true }).notNull().defaultNow(),
  finalizadoEn: timestamp("finalizado_en", { withTimezone: true }),
  estado: alqEstadoSyncEnum("estado").notNull().default("en_curso"),
  cbcsProcesados: integer("cbcs_procesados").notNull().default(0),
  cbcsFallidos: integer("cbcs_fallidos").notNull().default(0),
  erroresJson: text("errores_json"),
  // Mapa {rutaSharePoint: hashSha256} de los CBC + Excel maestro procesados en
  // esta corrida — permite saltar el reproceso de archivos sin cambios (lee el
  // último run al arrancar la sincronización siguiente).
  hashesJson: text("hashes_json"),
  usuarioEmail: text("usuario_email"),
});
