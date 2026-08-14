CREATE TYPE "public"."cp_tipo_duplicado" AS ENUM('proveedor', 'producto');--> statement-breakpoint
CREATE TABLE "cp_duplicados_descartados" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "cp_tipo_duplicado" NOT NULL,
	"ids" text NOT NULL,
	"comentario" text NOT NULL,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cp_duplicados_descartados_tipo_ids_idx" ON "cp_duplicados_descartados" USING btree ("tipo","ids");