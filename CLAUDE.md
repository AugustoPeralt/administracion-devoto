# administracionDevoto

Panel interno de administración (no público). Next.js App Router + Drizzle ORM +
Neon Postgres, desplegado en Vercel. Auth con Microsoft Entra ID, acceso restringido
a una whitelist de emails (`ALLOWED_EMAILS`).

Origen de datos real: Excels en SharePoint (tesorería, alquileres, precios, RRHH),
sincronizados vía Microsoft Graph API. El diseño no es genérico — está hecho a medida
de la estructura real de esos Excels. Ver `PLAN_TECNICO.md` para el racional completo
de decisiones de stack y los hallazgos detallados de los archivos de origen.

## Stack

- Next.js (App Router) + React 19 + TypeScript estricto
- Drizzle ORM (`db/schema.ts`) sobre Neon Postgres serverless (`@neondatabase/serverless`)
- next-auth v5 beta, proveedor Microsoft Entra ID (`auth.ts`)
- Alias de import `@/*` → raíz del repo (`tsconfig.json`)
- Scripts uno-off/sync en `scripts/*.ts`, ejecutados con `tsx`
- Tests: `tsx --test`, colocados junto al código como `*.test.ts` (no hay carpeta `__tests__`)

## Mapa de módulos

El repo tiene 4 dominios de negocio independientes, cada uno con su propio prefijo de
tablas, su carpeta en `lib/` y sus rutas en `app/`:

| Dominio | Prefijo tablas | `lib/` | `app/` | Qué es |
|---|---|---|---|---|
| Tesorería/consolidados | sin prefijo (`cajas`, `movimientos_caja`, ...) | `queries.ts`, `anomalias.ts`, `matching-texto.ts` | `consolidados/` | Cajas operativas y de obra, importadas de `CONSOLIDADO 2026.xlsx` / `CONSOLIDADO OBRAS.xlsx` |
| Alquileres | `alq_` | `alquileres/` | `alquileres/` | Contratos, canon, pagos y alertas de locales alquilados |
| Control de precios | `cp_` | `control-precios/` | `control-precios/`, `api/control-precios/` | Comparación de precios entre proveedores a partir de facturas cargadas |
| RRHH | (sin tablas propias todavía) | `rrhh/` | — (sin UI, solo `scripts/sync-rrhh.ts` + GitHub Action) | Sincronización Presentismo → Nómina. **En stand-by**, ver memoria `rrhh-presentismo-nomina-plan` |

Cada `lib/<dominio>/` sigue el mismo patrón interno: `tipos.ts` (tipos del dominio),
`consultas.ts` o `queries` (lecturas Drizzle), `sincronizar-sharepoint.ts` (si el dominio
importa de SharePoint), y parsers/helpers específicos.

Server actions viven junto a las páginas que las usan (`app/<ruta>/actions.ts`, con
`"use server"` arriba), no centralizadas. Escriben directo con Drizzle y hacen
`revalidatePath()` sobre las rutas afectadas — no hay capa de API REST salvo en
`app/api/control-precios/` y `app/api/auth/`.

## Reglas de negocio no obvias (no derivables leyendo un solo archivo)

- **Ajustes ocultos en montos de Excel**: una celda de columna `$`/`USD` puede ser una
  fórmula de aritmética literal (ej. `=-15399000+452000`) en vez de un valor fijo. Eso
  es un ajuste manual y hay que detectarlo y guardarlo aparte del valor calculado — no
  confundir con fórmulas *estructurales* normales (ej. `TOTAL $` = saldo acumulado).
  Detalle completo y regla exacta en `PLAN_TECNICO.md` sección 1.3.
- **`TITULAR` en los Excels de caja es un `VLOOKUP`**, no un dato crudo — no tratarlo
  como fuente de verdad, resolver contra la tabla `titulares`.
- **`CAJA GENERAL` (obras)** tiene columnas de dolarización con referencias a un libro
  externo roto (`[8]TC`) — esos valores están congelados, no confiables como tipo de
  cambio real.
- **Alquileres en efectivo (cod. 3)** se separan por titular real, no por el código
  crudo de la planilla — ver commits recientes sobre TAVLON/JAKIM/MILITAR si hace falta
  el criterio exacto de clasificación.
- **Auth Microsoft**: `authorization.params` en `auth.ts` reemplaza (no combina) los
  scopes por defecto del provider — hay que repetir el scope base ahí. El claim
  `email` puede venir vacío en cuentas organizacionales; se usa `preferred_username`
  como fallback porque es lo que efectivamente matchea contra `ALLOWED_EMAILS`.

## Features/planes en stand-by (no reabrir sin que el usuario lo pida)

- Fechas de aumento en reporte de control de precios — ver memoria
  `control-precios-feature-fechas-aumento`.
- Automatización RRHH Presentismo→Nómina — scaffolding ya hecho (`lib/rrhh/`,
  `scripts/sync-rrhh.ts`, `.github/workflows/sync-rrhh.yml`), bloqueada en Fase 2 por
  datos que tiene que aportar el usuario. Ver memoria `rrhh-presentismo-nomina-plan`
  para el roadmap de fases completo.

Si vas a tocar alguno de estos dos temas, preguntar primero el alcance actual — no
asumir diseño solo a partir de la memoria, puede haber cambiado.

## Comandos

```
npm run dev / build / start          # Next.js
npm run lint                         # ESLint
npm run db:generate / db:migrate / db:push / db:studio   # Drizzle
npm test                             # tsx --test scripts/**/*.test.ts lib/**/*.test.ts

npm run sharepoint:listar            # listar contenido de SharePoint (debug)
npm run sharepoint:sync              # sync consolidados

npm run rrhh:listar                  # listar archivos RRHH en SharePoint (debug)
npm run rrhh:sync:dry                # dry-run del sync RRHH (no requiere permiso de escritura)
npm run rrhh:sync                    # sync RRHH real (requiere Files.ReadWrite.All o Sites.ReadWrite.All)

npm run control-precios:probar-delta # probar cálculo de delta de precios entre proveedores
```

Hay más scripts puntuales en `scripts/` (correcciones de casos específicos, importaciones
puntuales) — son de uso único/histórico, no parte del flujo recurrente.

## Convenciones

- Todo el dominio (tablas, funciones, componentes de negocio, rutas) en español;
  identificadores técnicos genéricos (props, tipos utilitarios) pueden ir en inglés.
- No crear una capa de API REST para algo que puede ser una server action.
- Las migraciones de Drizzle (`db/migrations/*.sql` y `meta/`) son generadas —no
  editarlas a mano; correr `db:generate` tras cambiar `db/schema.ts`.
- Excels de origen son la fuente de verdad de negocio pero no de estructura — los
  parsers asumen headers/hojas específicos confirmados contra archivos reales, no
  diseño genérico. Si un parser falla con un Excel nuevo, sospechar primero de un
  cambio de estructura del archivo antes que de un bug del parser.
