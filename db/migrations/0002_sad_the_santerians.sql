CREATE TABLE "conceptos_esperados" (
	"id" serial PRIMARY KEY NOT NULL,
	"caja_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"cod_titular" integer,
	"cod_cuenta" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conceptos_esperados" ADD CONSTRAINT "conceptos_esperados_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;