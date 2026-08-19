CREATE TYPE "public"."cp_afip_motivo_exclusion" AS ENUM('ALQUILER', 'SERVICIO', 'OTRO');--> statement-breakpoint
CREATE TABLE "cp_afip_exclusiones" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuit" text NOT NULL,
	"nombre" text NOT NULL,
	"motivo" "cp_afip_motivo_exclusion" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cp_afip_exclusiones_cuit_idx" ON "cp_afip_exclusiones" USING btree ("cuit");