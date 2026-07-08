CREATE TYPE "public"."alq_estado_contrato" AS ENUM('vigente', 'historico', 'adenda', 'pendiente');--> statement-breakpoint
CREATE TYPE "public"."alq_estado_sync" AS ENUM('en_curso', 'completado', 'con_errores');--> statement-breakpoint
CREATE TYPE "public"."alq_prioridad_alerta" AS ENUM('critica', 'urgente', 'proxima', 'informativa');--> statement-breakpoint
CREATE TYPE "public"."alq_tipo_alerta" AS ENUM('vencimiento_contrato', 'decision_prorroga', 'pago_pendiente', 'pago_vencido', 'ajuste_proximo', 'ajuste_hoy', 'proveedor_no_mapeado');--> statement-breakpoint
CREATE TABLE "alq_alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_run_id" integer NOT NULL,
	"prioridad" "alq_prioridad_alerta" NOT NULL,
	"local" text NOT NULL,
	"tipo_alerta" "alq_tipo_alerta" NOT NULL,
	"descripcion" text NOT NULL,
	"fecha_evento" date,
	"dias_restantes" integer,
	"accion_requerida" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alq_alquileres_mensuales" (
	"id" serial PRIMARY KEY NOT NULL,
	"local" text NOT NULL,
	"proveedor_cbc" text NOT NULL,
	"mes" text NOT NULL,
	"total_facturado" numeric(18, 2) NOT NULL,
	"total_pagado" numeric(18, 2) NOT NULL,
	"saldo" numeric(18, 2) NOT NULL,
	"fecha_ultimo_pago" date,
	"sync_run_id" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alq_canon_vigente_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"local" text NOT NULL,
	"dia_pago_desde" integer DEFAULT 1 NOT NULL,
	"dia_pago_hasta" integer DEFAULT 10 NOT NULL,
	"proximo_ajuste" date,
	"indice_ajuste" text,
	"preaviso_prorroga_dias" integer DEFAULT 30 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alq_canon_vigente_config_local_unique" UNIQUE("local")
);
--> statement-breakpoint
CREATE TABLE "alq_contratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"local_id" integer NOT NULL,
	"contrato_id_excel" integer NOT NULL,
	"estado" "alq_estado_contrato" NOT NULL,
	"tipo" text,
	"domicilio" text,
	"partes" text,
	"fecha_contrato" date,
	"vencimiento" date,
	"plazo" text,
	"valor_moneda" text,
	"actualizacion" text,
	"prorroga" text,
	"voluntad" text,
	"renegociacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alq_documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"local_id" integer,
	"nombre" text NOT NULL,
	"web_url" text NOT NULL,
	"sharepoint_path" text NOT NULL,
	"drive_item_id" text,
	"tamanio_bytes" integer,
	"modificado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alq_facturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"alquiler_mensual_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"razon_social" text NOT NULL,
	"cuit" text NOT NULL,
	"monto" numeric(18, 2) NOT NULL,
	"tipo_comprobante" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alq_locales" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alq_locales_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "alq_locales_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_cbc" text NOT NULL,
	"local_canonico" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alq_locales_mapping_proveedor_cbc_unique" UNIQUE("proveedor_cbc")
);
--> statement-breakpoint
CREATE TABLE "alq_pagos" (
	"id" serial PRIMARY KEY NOT NULL,
	"alquiler_mensual_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"monto" numeric(18, 2) NOT NULL,
	"medio" text NOT NULL,
	"nro_cheque" text
);
--> statement-breakpoint
CREATE TABLE "alq_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"iniciado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_en" timestamp with time zone,
	"estado" "alq_estado_sync" DEFAULT 'en_curso' NOT NULL,
	"cbcs_procesados" integer DEFAULT 0 NOT NULL,
	"cbcs_fallidos" integer DEFAULT 0 NOT NULL,
	"errores_json" text,
	"usuario_email" text
);
--> statement-breakpoint
ALTER TABLE "alq_alertas" ADD CONSTRAINT "alq_alertas_sync_run_id_alq_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."alq_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alq_alquileres_mensuales" ADD CONSTRAINT "alq_alquileres_mensuales_sync_run_id_alq_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."alq_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alq_contratos" ADD CONSTRAINT "alq_contratos_local_id_alq_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alq_documentos" ADD CONSTRAINT "alq_documentos_local_id_alq_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alq_facturas" ADD CONSTRAINT "alq_facturas_alquiler_mensual_id_alq_alquileres_mensuales_id_fk" FOREIGN KEY ("alquiler_mensual_id") REFERENCES "public"."alq_alquileres_mensuales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alq_pagos" ADD CONSTRAINT "alq_pagos_alquiler_mensual_id_alq_alquileres_mensuales_id_fk" FOREIGN KEY ("alquiler_mensual_id") REFERENCES "public"."alq_alquileres_mensuales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alq_alquileres_local_mes_idx" ON "alq_alquileres_mensuales" USING btree ("local","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "alq_contratos_local_id_excel_idx" ON "alq_contratos" USING btree ("local_id","contrato_id_excel");