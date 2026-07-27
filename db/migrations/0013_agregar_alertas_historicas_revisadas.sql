CREATE TABLE "alertas_historicas_revisadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"concepto_id" integer NOT NULL,
	"mes" text NOT NULL,
	"estado" "estado_duplicado" NOT NULL,
	"comentario" text NOT NULL,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas_historicas_revisadas" ADD CONSTRAINT "alertas_historicas_revisadas_concepto_id_conceptos_esperados_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."conceptos_esperados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_historicas_caso_idx" ON "alertas_historicas_revisadas" USING btree ("concepto_id","mes");