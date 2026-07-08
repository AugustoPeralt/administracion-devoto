CREATE TYPE "public"."accion_carga" AS ENUM('importado', 'descartado', 'marcado_revision');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."tipo_caja" AS ENUM('operativa', 'obra');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TABLE "cajas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_caja" NOT NULL,
	"archivo_origen" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justificaciones_auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"movimiento_id" integer NOT NULL,
	"usuario_email" text NOT NULL,
	"comentario" text NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp
);
--> statement-breakpoint
CREATE TABLE "movimientos_caja" (
	"id" serial PRIMARY KEY NOT NULL,
	"caja_id" integer NOT NULL,
	"archivo_origen" text NOT NULL,
	"fila_excel" integer NOT NULL,
	"fecha" date NOT NULL,
	"cod_titular" integer,
	"titular_resuelto" text,
	"cod_cuenta" integer,
	"cuenta_resuelta" text,
	"concepto_manual" text,
	"descripcion_final" text NOT NULL,
	"monto_ars" numeric(18, 2) NOT NULL,
	"monto_usd" numeric(18, 2),
	"tipo_movimiento" "tipo_movimiento" NOT NULL,
	"saldo_acumulado_ars" numeric(18, 2),
	"saldo_acumulado_usd" numeric(18, 2),
	"formula_original" text,
	"requiere_justificacion" boolean DEFAULT false NOT NULL,
	"es_saldo_inicial" boolean DEFAULT false NOT NULL,
	"anomalia" text,
	"color_fondo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_cuentas" (
	"id" serial PRIMARY KEY NOT NULL,
	"cod" integer NOT NULL,
	"grupo" text,
	"rubro" text,
	"subrubro" text,
	"cuenta" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registro_auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"archivo" text NOT NULL,
	"hash_archivo" text NOT NULL,
	"fecha_modificacion_sharepoint" timestamp,
	"modificado_por_sharepoint" text,
	"hoja" text,
	"fila_excel" integer,
	"tipo_anomalia" text,
	"accion_tomada" "accion_carga" NOT NULL,
	"fecha_carga" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titulares" (
	"id" serial PRIMARY KEY NOT NULL,
	"archivo_origen" text NOT NULL,
	"cod" integer NOT NULL,
	"nombre" text NOT NULL,
	"grupo1" text,
	"grupo2" text,
	"grupo3" text,
	"razon_social" text,
	"cuit" text,
	"telefono" text
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"rol" "rol_usuario" DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "justificaciones_auditoria" ADD CONSTRAINT "justificaciones_auditoria_movimiento_id_movimientos_caja_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cajas_nombre_archivo_idx" ON "cajas" USING btree ("nombre","archivo_origen");--> statement-breakpoint
CREATE UNIQUE INDEX "justificaciones_movimiento_idx" ON "justificaciones_auditoria" USING btree ("movimiento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_natural_key_idx" ON "movimientos_caja" USING btree ("archivo_origen","caja_id","fila_excel");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_cuentas_cod_idx" ON "plan_cuentas" USING btree ("cod");--> statement-breakpoint
CREATE UNIQUE INDEX "titulares_archivo_cod_idx" ON "titulares" USING btree ("archivo_origen","cod");