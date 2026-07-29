CREATE TABLE "cp_sustitutos_producto" (
	"id" serial PRIMARY KEY NOT NULL,
	"lista_a_id" integer NOT NULL,
	"lista_b_id" integer NOT NULL,
	"confirmado" boolean DEFAULT true NOT NULL,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_sustitutos_producto" ADD CONSTRAINT "cp_sustitutos_producto_lista_a_id_cp_listas_precios_proveedor_id_fk" FOREIGN KEY ("lista_a_id") REFERENCES "public"."cp_listas_precios_proveedor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_sustitutos_producto" ADD CONSTRAINT "cp_sustitutos_producto_lista_b_id_cp_listas_precios_proveedor_id_fk" FOREIGN KEY ("lista_b_id") REFERENCES "public"."cp_listas_precios_proveedor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_sustitutos_producto_a_b_idx" ON "cp_sustitutos_producto" USING btree ("lista_a_id","lista_b_id");