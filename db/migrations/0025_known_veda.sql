CREATE TABLE "cp_facturas_repetidas_revisadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"proveedor_id" integer NOT NULL,
	"local_id" integer,
	"numero_factura_normalizado" text NOT NULL,
	"estado" "estado_duplicado" NOT NULL,
	"comentario" text NOT NULL,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_facturas_repetidas_revisadas" ADD CONSTRAINT "cp_facturas_repetidas_revisadas_proveedor_id_cp_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."cp_proveedores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_facturas_repetidas_revisadas" ADD CONSTRAINT "cp_facturas_repetidas_revisadas_local_id_alq_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_facturas_repetidas_caso_idx" ON "cp_facturas_repetidas_revisadas" USING btree ("proveedor_id","local_id","numero_factura_normalizado");