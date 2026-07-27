CREATE TYPE "public"."cp_categoria_insumo" AS ENUM('CARNE', 'ALMACEN', 'VERDULERIA', 'BEBIBLES', 'DESCARTABLES');--> statement-breakpoint
CREATE TYPE "public"."cp_estado_factura" AS ENUM('pendiente_revision', 'confirmada');--> statement-breakpoint
CREATE TYPE "public"."cp_precio_origen" AS ENUM('factura', 'referencia_5cynar', 'manual');--> statement-breakpoint
CREATE TABLE "cp_detalle_facturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"factura_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"cantidad" numeric(12, 2) NOT NULL,
	"precio_unitario" numeric(18, 2),
	"subtotal" numeric(18, 2),
	"precio_origen" "cp_precio_origen" DEFAULT 'factura' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cp_facturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_id" integer NOT NULL,
	"fecha_emision" date NOT NULL,
	"fecha_carga" timestamp with time zone DEFAULT now() NOT NULL,
	"monto_total" numeric(18, 2) NOT NULL,
	"archivo_url" text,
	"estado" "cp_estado_factura" DEFAULT 'pendiente_revision' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cp_precios_referencia_verduleria" (
	"id" serial PRIMARY KEY NOT NULL,
	"producto_nombre_normalizado" text NOT NULL,
	"producto_nombre" text NOT NULL,
	"unidad_medida" text DEFAULT 'u' NOT NULL,
	"periodo" date NOT NULL,
	"precio_unitario" numeric(18, 2) NOT NULL,
	"archivo_origen" text NOT NULL,
	"importado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cp_productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"proveedor_id" integer NOT NULL,
	"unidad_medida" text DEFAULT 'u' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cp_proveedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" "cp_categoria_insumo" NOT NULL,
	"cuit" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_detalle_facturas" ADD CONSTRAINT "cp_detalle_facturas_factura_id_cp_facturas_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."cp_facturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_detalle_facturas" ADD CONSTRAINT "cp_detalle_facturas_producto_id_cp_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."cp_productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_facturas" ADD CONSTRAINT "cp_facturas_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_productos" ADD CONSTRAINT "cp_productos_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_precios_referencia_nombre_periodo_idx" ON "cp_precios_referencia_verduleria" USING btree ("producto_nombre_normalizado","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_productos_nombre_proveedor_idx" ON "cp_productos" USING btree ("nombre","proveedor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_proveedores_cuit_idx" ON "cp_proveedores" USING btree ("cuit");