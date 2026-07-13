CREATE TABLE "alquileres_efectivo" (
	"id" serial PRIMARY KEY NOT NULL,
	"caja_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"cod_titular" integer DEFAULT 3 NOT NULL,
	"palabras_clave" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alquileres_efectivo" ADD CONSTRAINT "alquileres_efectivo_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alquileres_efectivo_caja_nombre_idx" ON "alquileres_efectivo" USING btree ("caja_id","nombre");