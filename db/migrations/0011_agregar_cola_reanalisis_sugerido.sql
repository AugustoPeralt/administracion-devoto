CREATE TABLE "cp_reanalisis_sugerido" (
	"id" serial PRIMARY KEY NOT NULL,
	"detalle_id" integer NOT NULL,
	"precio_ia" numeric(18, 2),
	"descuento_ia" numeric(18, 2),
	"subtotal_ia" numeric(18, 2),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cp_reanalisis_sugerido_detalle_id_unique" UNIQUE("detalle_id")
);
--> statement-breakpoint
ALTER TABLE "cp_reanalisis_sugerido" ADD CONSTRAINT "cp_reanalisis_sugerido_detalle_id_cp_detalle_facturas_id_fk" FOREIGN KEY ("detalle_id") REFERENCES "public"."cp_detalle_facturas"("id") ON DELETE cascade ON UPDATE no action;