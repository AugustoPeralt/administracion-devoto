CREATE TABLE "consistencia_saldos" (
	"id" serial PRIMARY KEY NOT NULL,
	"caja_id" integer NOT NULL,
	"saldo_calculado_ars" numeric(18, 2) NOT NULL,
	"saldo_excel_ars" numeric(18, 2),
	"diferencia_ars" numeric(18, 2),
	"saldo_calculado_usd" numeric(18, 2) NOT NULL,
	"saldo_excel_usd" numeric(18, 2),
	"diferencia_usd" numeric(18, 2),
	"fila_totales_encontrada" boolean DEFAULT false NOT NULL,
	"verificado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consistencia_saldos" ADD CONSTRAINT "consistencia_saldos_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consistencia_saldos_caja_idx" ON "consistencia_saldos" USING btree ("caja_id");