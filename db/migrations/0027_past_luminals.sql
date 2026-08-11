CREATE TABLE "cp_facturas_repetidas_revisadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_id" integer NOT NULL,
	"factura_ids" text NOT NULL,
	"estado" "estado_duplicado" NOT NULL,
	"comentario" text NOT NULL,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_facturas_repetidas_revisadas" ADD CONSTRAINT "cp_facturas_repetidas_revisadas_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_facturas_repetidas_ids_idx" ON "cp_facturas_repetidas_revisadas" USING btree ("factura_ids");