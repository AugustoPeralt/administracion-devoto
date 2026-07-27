CREATE TABLE "cp_listas_precios_historial" (
	"id" serial PRIMARY KEY NOT NULL,
	"importacion_id" integer NOT NULL,
	"codigo_proveedor" text NOT NULL,
	"descripcion" text NOT NULL,
	"categoria" text,
	"precio_lista" numeric(18, 2) NOT NULL,
	"precio_con_bonificacion" numeric(18, 2),
	"producto_id" integer
);
--> statement-breakpoint
CREATE TABLE "cp_listas_precios_importaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_id" integer NOT NULL,
	"archivo_origen" text NOT NULL,
	"importado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_listas_precios_historial" ADD CONSTRAINT "cp_listas_precios_historial_importacion_id_cp_listas_precios_importaciones_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."cp_listas_precios_importaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_listas_precios_historial" ADD CONSTRAINT "cp_listas_precios_historial_producto_id_cp_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."cp_productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_listas_precios_importaciones" ADD CONSTRAINT "cp_listas_precios_importaciones_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE cascade ON UPDATE no action;