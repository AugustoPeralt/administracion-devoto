CREATE TABLE "graph_auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta" text NOT NULL,
	"refresh_token" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_auth_tokens_cuenta_unique" UNIQUE("cuenta")
);
--> statement-breakpoint
ALTER TABLE "cp_pares_precios_proveedores" ADD COLUMN "distinta_marca" boolean DEFAULT false NOT NULL;