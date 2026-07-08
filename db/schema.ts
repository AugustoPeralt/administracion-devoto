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
