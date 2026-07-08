CREATE TYPE "public"."estado_duplicado" AS ENUM('confirmado', 'justificado');--> statement-breakpoint
CREATE TABLE "duplicados_revisados" (
	"id" serial PRIMARY KEY NOT NULL,
	"caja_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"cod_titular" integer NOT NULL,
	"estado" "estado_duplicado" NOT NULL,
	"comentario" text NOT NULL,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duplicados_revisados" ADD CONSTRAINT "duplicados_revisados_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duplicados_caso_idx" ON "duplicados_revisados" USING btree ("caja_id","fecha","cod_titular");