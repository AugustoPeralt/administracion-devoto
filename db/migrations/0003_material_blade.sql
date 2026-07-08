ALTER TABLE "conceptos_esperados" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conceptos_esperados" ALTER COLUMN "creado_en" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "consistencia_saldos" ALTER COLUMN "verificado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consistencia_saldos" ALTER COLUMN "verificado_en" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "justificaciones_auditoria" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "justificaciones_auditoria" ALTER COLUMN "creado_en" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "justificaciones_auditoria" ALTER COLUMN "actualizado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "registro_auditoria" ALTER COLUMN "fecha_modificacion_sharepoint" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registro_auditoria" ALTER COLUMN "fecha_carga" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registro_auditoria" ALTER COLUMN "fecha_carga" SET DEFAULT now();