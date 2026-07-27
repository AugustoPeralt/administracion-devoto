CREATE TABLE "cp_listas_precios_proveedor" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_id" integer NOT NULL,
	"codigo_proveedor" text NOT NULL,
	"descripcion" text NOT NULL,
	"presentacion" text,
	"categoria" text,
	"precio_lista" numeric(18, 2) NOT NULL,
	"precio_con_bonificacion" numeric(18, 2),
	"producto_id" integer,
	"archivo_origen" text NOT NULL,
	"importado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cp_pares_precios_proveedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"lista_a_id" integer NOT NULL,
	"lista_b_id" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_listas_precios_proveedor" ADD CONSTRAINT "cp_listas_precios_proveedor_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_listas_precios_proveedor" ADD CONSTRAINT "cp_listas_precios_proveedor_producto_id_cp_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."cp_productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_pares_precios_proveedores" ADD CONSTRAINT "cp_pares_precios_proveedores_lista_a_id_cp_listas_precios_proveedor_id_fk" FOREIGN KEY ("lista_a_id") REFERENCES "public"."cp_listas_precios_proveedor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_pares_precios_proveedores" ADD CONSTRAINT "cp_pares_precios_proveedores_lista_b_id_cp_listas_precios_proveedor_id_fk" FOREIGN KEY ("lista_b_id") REFERENCES "public"."cp_listas_precios_proveedor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_listas_precios_proveedor_codigo_idx" ON "cp_listas_precios_proveedor" USING btree ("proveedor_id","codigo_proveedor");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_pares_precios_a_b_idx" ON "cp_pares_precios_proveedores" USING btree ("lista_a_id","lista_b_id");