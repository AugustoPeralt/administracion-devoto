CREATE TABLE "cp_comparaciones_restaurantes_revisadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"producto_id" integer NOT NULL,
	"local_a_id" integer NOT NULL,
	"local_b_id" integer NOT NULL,
	"local_mas_barato_id" integer NOT NULL,
	"precio_minimo" numeric(18, 2) NOT NULL,
	"fecha_mas_barato" date NOT NULL,
	"factura_id_mas_barato" integer NOT NULL,
	"local_mas_caro_id" integer NOT NULL,
	"precio_maximo" numeric(18, 2) NOT NULL,
	"fecha_mas_caro" date NOT NULL,
	"factura_id_mas_caro" integer NOT NULL,
	"porcentaje_diferencia" numeric(6, 2) NOT NULL,
	"comentario" text,
	"usuario_email" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_producto_id_cp_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."cp_productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_local_a_id_alq_locales_id_fk" FOREIGN KEY ("local_a_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_local_b_id_alq_locales_id_fk" FOREIGN KEY ("local_b_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_local_mas_barato_id_alq_locales_id_fk" FOREIGN KEY ("local_mas_barato_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_factura_id_mas_barato_cp_facturas_id_fk" FOREIGN KEY ("factura_id_mas_barato") REFERENCES "public"."cp_facturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_local_mas_caro_id_alq_locales_id_fk" FOREIGN KEY ("local_mas_caro_id") REFERENCES "public"."alq_locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cp_comparaciones_restaurantes_revisadas" ADD CONSTRAINT "cp_comparaciones_restaurantes_revisadas_factura_id_mas_caro_cp_facturas_id_fk" FOREIGN KEY ("factura_id_mas_caro") REFERENCES "public"."cp_facturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_comparaciones_revisadas_par_idx" ON "cp_comparaciones_restaurantes_revisadas" USING btree ("producto_id","local_a_id","local_b_id");