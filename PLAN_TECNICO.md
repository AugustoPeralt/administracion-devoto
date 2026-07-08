# Plan Técnico: Visor y Auditor de Tesorería
### SharePoint ➔ Next.js (Vercel) + Neon Postgres + Drizzle ORM

> Documento vivo. Cada fase se cierra con un checklist verificable antes de pasar a la siguiente. No avanzar de fase sin marcar todos los ítems.

---

## 0. Decisiones de stack (cerradas)

| Decisión | Elección | Motivo |
|---|---|---|
| Base de datos | Neon Postgres | Nativo del ecosistema Vercel, relacional, sin salir a nubes externas |
| Driver | `@neondatabase/serverless` | Compatible con Serverless Functions / Edge de Next.js |
| ORM | **Drizzle ORM** | SQL-first, cold start más rápido en serverless, mejor para queries de agregación del dashboard |
| Framework | Next.js (App Router) | Despliegue directo en Vercel |
| Origen de datos | 2 Excels de SharePoint: `CONSOLIDADO 2026.xlsx` (cajas operativas) y `CONSOLIDADO OBRAS.xlsx` (cajas de obra) | Confirmado con análisis real de los archivos (sección 1) |
| Acceso Graph API | Admin M365 disponible | Habilita App Registration con client credentials desde Fase 3 |

---

## 1. Hallazgos reales de los archivos de origen

Se analizaron ambos Excels celda por celda (no es un diseño genérico). Esto es lo que el parser tiene que soportar sí o sí:

### 1.1 Estructura de hojas

**CONSOLIDADO 2026.xlsx** — 9 hojas de caja operativa: `ALICIA, BETULAR, MECHA, PEPE, LUCCA, 6 BLVD, TAVLON, BENITO, CAJA FRAN`, más `Plan de Cuentas`, `Titulares`, `RESUMEN` (dashboard de saldos) y `DASHBOARD` (panel del día — es el prototipo funcional de lo que hay que reproducir en Fase 2).

**CONSOLIDADO OBRAS.xlsx** — 4 hojas de caja de obra: `PALERMO, CENTRO, MERCAT, CAJA GENERAL`, más hojas de `Cuenta corriente [proyecto]` (aportes de socios, fuera de alcance de `movimientos_caja` por ahora), `Totales ` (cronograma de cuotas de socios), y los mismos `Plan de Cuentas` / `Titulares`.

Total: **13 cajas** a modelar (9 operativas + 4 de obra).

### 1.2 Columnas reales por tipo de hoja

**Cajas operativas (2026.xlsx)** — headers en fila 3-4: `FECHA | COD | TITULAR | CONCEPTO | $ | USD | TOTAL $ | TOTAL USD`
- `TITULAR` es una fórmula `VLOOKUP` contra `Titulares`, no un dato crudo.
- `TOTAL $` / `TOTAL USD` son saldo acumulado fila a fila — se recalculan en DB, no se importan como verdad.
- El signo de `$` determina ingreso (+) o egreso (−). No hay columna separada de tipo de movimiento.

**Cajas de obra (OBRAS.xlsx)** — doble clasificación: `FECHA | COD(titular) | TITULAR | COD(cuenta) | CUENTA | CONCEPTO | $ | USD | TOTAL $ | TOTAL USD`
- `CUENTA` resuelve contra `Plan de Cuentas` (jerarquía Grupo→Rubro→Sub-Rubro→Cuenta, ~270 cuentas).
- `CAJA GENERAL` tiene columnas extra de dolarización con referencias a un libro externo roto (`[8]TC`) — esos valores están congelados, no confiables como fuente de verdad para tipo de cambio.

### 1.3 Caso crítico: ajustes ocultos en fórmulas de monto (confirmado en datos reales)

Se confirmó el patrón que señalaste: la celda de monto (`$`) a veces no es un valor fijo sino una fórmula de aritmética literal, por ejemplo en la hoja con "SUELDOS OPERATIVOS":

```
= -15399000 + 452000
```

y otros casos reales encontrados: `=500000+277300`, `=-14117000-733000`.

Esto es distinto de las fórmulas *estructurales* esperadas (ej. `TOTAL $` = `=+E5+G4`, que es saldo acumulado normal y no debe marcarse). La regla de detección es:

> Una celda de la columna `$`/`USD` (monto) está en fórmula (`data_only=False` empieza con `=`) **y** esa fórmula sólo combina números literales con operadores `+ - * /` (sin referencias a otras celdas, sin funciones). → Es un ajuste manual oculto.

El parser debe leer **ambas** representaciones de la celda:
- `data_only=True` → valor calculado (lo que se usa como `monto_ars`).
- `data_only=False` → string de la fórmula cruda, guardado tal cual si matchea el patrón de ajuste.

### 1.4 Reglas de validación que el propio Excel ya tiene (reusar, no reinventar)

El archivo tiene formato condicional que el parser puede traducir 1:1 a reglas de auditoría automáticas:
1. Si `VLOOKUP` de `TITULAR` da error (`#N/A`) → código huérfano (`COD` sin match en `Titulares`).
2. Si hay monto pero falta `FECHA` o `COD` → fila incompleta.

### 1.5 Otras inconsistencias que el parser debe tolerar

- Fila `"TOTALES"` al final de cada hoja mezclada con los datos (se identifica por texto, no por posición fija — la última fila varía por hoja).
- Fila de "saldo inicial" (fila 4/5) sin fecha/código, solo saldo de arrastre.
- El título en `A1` de cada hoja está mal copiado (ej. varias hojas dicen literalmente "CAJA BETULAR" aunque sean otra caja) — **el nombre real de la caja es el nombre de la hoja (sheet name), nunca `A1`**.
- Columna `COD` a veces tiene basura (`' '`, `'TOTA'` truncado) — tolerar como `null` + log de anomalía.
- Dos modos de carga alternando: por código (`COD` → `TITULAR` vía VLOOKUP) o manual (`CONCEPTO` en texto libre, `COD` vacío). Usar `COALESCE(concepto_manual, titular_resuelto, cuenta_resuelta)` como descripción final.
- `max_row` reportado por Excel (1000) no coincide con datos reales — filtrar por `FECHA` no vacía.
- Encoding UTF-8 explícito (tildes, "Señas", "DÍA").

---

## 2. Modelo de datos (Drizzle / Neon)

```
cajas
├─ id (pk)
├─ nombre            -- ALICIA, BETULAR, ..., PALERMO, CAJA GENERAL...
├─ tipo               -- enum: 'operativa' | 'obra'
└─ archivo_origen     -- 'CONSOLIDADO 2026' | 'CONSOLIDADO OBRAS'

titulares
├─ id (pk)
├─ archivo_origen
├─ cod
├─ nombre
├─ grupo1 / grupo2 / grupo3
└─ (OBRAS: razon_social, cuit, telefono)

plan_cuentas                -- compartido entre ambos archivos
├─ id (pk)
├─ cod
├─ grupo / rubro / subrubro / cuenta

movimientos_caja
├─ id (pk)
├─ caja_id (fk → cajas)
├─ archivo_origen
├─ fila_excel                    -- trazabilidad hacia el Excel original
├─ fecha
├─ cod_titular (nullable)
├─ titular_resuelto (nullable)   -- resuelto por JOIN a `titulares`, no por caché de Excel
├─ cod_cuenta (nullable)         -- solo OBRAS
├─ cuenta_resuelta (nullable)    -- resuelto por JOIN a `plan_cuentas`
├─ concepto_manual (nullable)
├─ descripcion_final             -- COALESCE calculado en el parser
├─ monto_ars (numeric)
├─ monto_usd (numeric, nullable)
├─ tipo_movimiento                -- enum: 'ingreso' | 'egreso', derivado del signo
├─ saldo_acumulado_ars           -- recalculado en DB, no importado de Excel
├─ saldo_acumulado_usd
├─ formula_original (text, nullable)   -- string crudo si la celda era fórmula de ajuste literal
├─ requiere_justificacion (boolean, default false)  -- true si formula_original matchea el patrón de ajuste
├─ es_fila_totales (boolean)
├─ es_saldo_inicial (boolean)
├─ anomalia (text, nullable)     -- 'vlookup_error' | 'fila_incompleta' | 'cod_no_numerico' | null
├─ color_fondo (text, nullable)  -- capturado por si se usa como método de pago; sin semántica confirmada
└─ created_at

justificaciones_auditoria
├─ id (pk)
├─ movimiento_id (fk → movimientos_caja, unique — 1 justificación activa por movimiento)
├─ usuario_email                 -- quién justificó (admin: vos o tu jefa)
├─ comentario (text)             -- de dónde viene la diferencia de dinero
├─ creado_en (timestamp)
└─ actualizado_en (timestamp, nullable)   -- si se edita la justificación

registro_auditoria                -- log de cada carga/sincronización
├─ id (pk)
├─ archivo
├─ hash_archivo                  -- para detectar si el Excel cambió desde SharePoint
├─ fecha_modificacion_sharepoint
├─ modificado_por_sharepoint     -- de Graph API (Fase 3)
├─ hoja
├─ fila_excel
├─ tipo_anomalia
├─ accion_tomada                 -- 'importado' | 'descartado' | 'marcado_revision'
└─ fecha_carga

usuarios
├─ id (pk)
├─ email
├─ nombre
└─ rol                            -- enum: 'admin' | 'viewer' (solo 2-3 usuarios esperados)
```

**Regla de negocio clave**: un movimiento con `requiere_justificacion = true` sin fila correspondiente en `justificaciones_auditoria` debe aparecer resaltado en el dashboard de auditoría hasta que un admin (rol `admin`) cargue el comentario. Esto es el equivalente digital de la fila naranja de "SUELDOS OPERATIVOS".

---

## 3. Fase 1 — Parseador local + infraestructura Neon

**Objetivo**: dado un Excel de los dos formatos reales, poblar las tablas de arriba de forma determinística e idempotente (reprocesar el mismo archivo no debe duplicar filas).

### 3.1 Estructura de carpetas

```
/db
  schema.ts              -- definición Drizzle de todas las tablas
  index.ts                -- cliente Neon + drizzle()
  migrations/
/scripts
  parse-excel.ts          -- entrypoint del parser (CLI, corre local primero)
  parsers/
    cajas-operativas.ts   -- lógica específica hojas 2026.xlsx
    cajas-obra.ts          -- lógica específica hojas OBRAS.xlsx
    catalogos.ts           -- Titulares + Plan de Cuentas
    ajuste-detector.ts     -- regex/parser de fórmulas de ajuste literal
  fixtures/                -- copias de los Excels de prueba (ya están en archivosCopiaDeConsolidados/)
```

### 3.2 Tareas concretas

1. `db/schema.ts`: definir todas las tablas de la sección 2 en Drizzle, con los enums (`tipo_caja`, `tipo_movimiento`, `rol`).
2. `drizzle-kit` + migración inicial contra Neon (variable de entorno `DATABASE_URL`).
3. `scripts/parsers/ajuste-detector.ts`: función pura `detectarAjuste(formulaString: string): { esAjuste: boolean }` — regex que acepta solo números y operadores `+ - * /` (sin letras salvo notación científica, sin `(` de función). Cubrir con tests unitarios usando los ejemplos reales encontrados (`=-15399000+452000`, `=500000+277300`) y casos negativos (`=+E5+G4`, `=SUM(...)`, `=VLOOKUP(...)`).
4. `scripts/parsers/catalogos.ts`: cargar `Titulares` y `Plan de Cuentas` primero (son dependencia de todo lo demás), acotando el rango de lectura explícitamente (no iterar 64825 filas vacías).
5. `scripts/parsers/cajas-operativas.ts` y `cajas-obra.ts`: iterar cada hoja de caja, aplicando:
   - Filtro de filas válidas (`FECHA` no vacía, excluir fila `"TOTALES"`).
   - Lectura dual de la celda de monto (`data_only=True` para el valor, `data_only=False` para la fórmula cruda).
   - Aplicar `ajuste-detector` sobre la fórmula cruda de la columna monto (nunca sobre `TOTAL $`, que es estructural).
   - Resolver `titular_resuelto` / `cuenta_resuelta` vía join a las tablas ya cargadas, no vía el caché del VLOOKUP de Excel.
   - Marcar `anomalia` según las 2 reglas nativas de Excel (código huérfano, fila incompleta) + `cod_no_numerico` si `COD` no parsea como entero.
   - Recalcular `saldo_acumulado_ars/usd` en el propio insert (no confiar en `TOTAL $` de Excel).
6. `scripts/parse-excel.ts`: orquesta todo, corre local contra los dos archivos de `archivosCopiaDeConsolidados/`, imprime resumen (filas importadas, anomalías, cuántos `requiere_justificacion=true`).
7. Idempotencia: definir una clave natural (`archivo_origen + hoja + fila_excel`) con `upsert` (Drizzle `onConflictDoUpdate`), para que correr el parser dos veces sobre el mismo archivo no duplique.

### 3.3 Checklist de salida de Fase 1

- [x] Las 13 cajas cargan sin excepciones no controladas. (5731 movimientos importados)
- [x] `SELECT count(*) FROM movimientos_caja WHERE requiere_justificacion = true` devuelve al menos el caso real de "SUELDOS OPERATIVOS" encontrado. (304 casos reales encontrados en las 13 cajas)
- [x] Reprocesar el mismo Excel no duplica filas. (verificado: 5731 antes y después de correr el import dos veces)
- [x] Anomalías (`vlookup_error`, `fila_incompleta`, `cod_no_numerico`) quedan registradas y son consultables. (12 anomalías + log completo en `registro_auditoria`)
- [x] Saldo acumulado recalculado en DB coincide (dentro de un margen razonable) con el `TOTAL $` final que muestra Excel, para al menos 2 cajas de control. (9 de 13 cajas coinciden exacto; ALICIA no es comparable por un formato de header propio sin texto; MECHA, 6 BLVD y CAJA FRAN difieren porque el propio Excel tiene errores de fórmula — ver hallazgo abajo)

**Hallazgo de auditoría real durante la verificación**: en la hoja `6 BLVD` de `CONSOLIDADO 2026.xlsx`, desde la fila 298 la columna `TOTAL $` quedó con una fórmula mal copiada que referencia la hoja `PEPE` (`=+PEPE!E471+G297`) en vez de sumar sus propios movimientos. Es un error real del Excel original (probablemente un copy-paste entre hojas), no del parser. Confirma que la decisión de recalcular `saldo_acumulado_ars/usd` en la base de datos — en vez de confiar en la columna `TOTAL $` de Excel — era la correcta. MECHA y CAJA FRAN muestran diferencias similares, probablemente por la misma causa; no se investigó fórmula por fórmula, pero quedan visibles para revisión manual comparando `saldo_acumulado_ars` del último movimiento de cada caja contra el `TOTAL $` de Excel.

**Nota**: `registro_auditoria` todavía no es idempotente (cada corrida agrega sus propias filas de log, incluso si el Excel no cambió) — aceptable para esta fase local; se resuelve en Fase 3 comparando `hash_archivo` antes de reprocesar.

---

## 4. Fase 2 — Frontend (Dashboard de control)

**Objetivo**: pantallas de uso exclusivo para vos y tu jefa (rol `admin`/`viewer`).

### 4.1 Pantallas

1. **Dashboard general** (equivalente digital de la hoja `DASHBOARD` de Excel): tarjetas por caja con Ingresos / Egresos / Neto del período seleccionado, filtro Día / Semana / Mes.
2. **Vista por caja**: tabla de movimientos filtrable, pestañas por tipo (`Personal`/operativa vs `Obras`), con columna visual para filas con `requiere_justificacion = true` (resaltado, como el naranja del Excel).
3. **Panel de auditoría**: listado de todos los movimientos con `requiere_justificacion = true` sin comentario asociado — pantalla de trabajo para que la dirección cierre esos casos cargando el comentario (formulario simple: movimiento → textarea → guardar en `justificaciones_auditoria`).
4. **Vista de anomalías**: movimientos con `anomalia IS NOT NULL` (códigos huérfanos, filas incompletas) — control de calidad de carga.

### 4.2 Checklist de salida de Fase 2

- [x] Filtros de tiempo funcionan sobre datos reales cargados en Fase 1. (Hoy / Últimos 7 días / Este mes / Todo, probado en navegador contra Neon)
- [x] Un admin puede justificar un ajuste y el estado cambia de "pendiente" a "justificado" en la UI. (probado end-to-end: formulario → server action → insert en `justificaciones_auditoria` → `revalidatePath` → badge "Justificado" visible)
- [ ] Acceso restringido a los 2-3 usuarios esperados (auth simple, ver 4.3). **Pendiente a propósito** — se decidió no bloquear Fase 2 con esto; hay que resolverlo antes de desplegar a una URL pública (Fase 4).

Pantallas construidas: Dashboard general (`/`, tarjetas por caja con filtro de período), Vista por caja (`/cajas/[id]`, tabla de movimientos con fórmula de ajuste visible), Auditoría (`/auditoria`, pendientes/todos + formulario de justificación), Anomalías (`/anomalias`), y **Errores de Excel** (`/errores-excel` — sección agregada a pedido explícito: compara saldo recalculado vs. `TOTAL $` de Excel por caja, para señalar sin corregir; ver 4.4).

### 4.3 Nota de autenticación
Actualizado: se adelantó la decisión. Login real con cuenta Microsoft (NextAuth/Auth.js v5 + proveedor `microsoft-entra-id`), reutilizando el mismo App Registration de Azure AD que se va a necesitar en Fase 3 para Graph API. Acceso restringido por `ALLOWED_EMAILS` (allowlist de emails) en el callback `signIn`. Código listo en `auth.ts`, `app/api/auth/[...nextauth]/route.ts` y `app/login/page.tsx`; falta que el usuario complete las credenciales del App Registration en `.env.local` y se agregue `middleware.ts` para proteger las rutas (pendiente, bloqueado por esas credenciales).

### 4.4 Principio de diseño: auditar, no corregir
Confirmado explícitamente por el usuario: la herramienta muestra y señala exactamente lo que hay en el Excel, nunca lo corrige. Los "errores de Excel" (fórmulas copiadas entre hojas, como el caso de 6 BLVD en Fase 1) se exponen en `/errores-excel` como algo a revisar en el archivo original, no se ajustan silenciosamente en la base de datos. Este mismo principio aplica a los ajustes ocultos: se registra la fórmula tal cual está, nunca se "limpia".

---

## 5. Fase 3 — Conexión con SharePoint (Microsoft Graph API)

**Objetivo**: descargar los Excels reales automáticamente y extraer metadata de auditoría (quién modificó, cuándo, historial de versiones).

### 5.1 Tareas

1. Azure AD App Registration (permisos admin ya confirmados): permisos de aplicación `Sites.Read.All` o `Files.Read.All` (client credentials flow, sin usuario interactivo — necesario para el cron de Fase 4).
2. Guardar `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` como variables de entorno en Vercel (nunca en el repo).
3. Endpoint/función que:
   - Ubica el archivo en SharePoint por path o `driveItem` id.
   - Descarga el binario (`GET /drives/{drive-id}/items/{item-id}/content`).
   - Consulta versiones (`GET /drives/{drive-id}/items/{item-id}/versions`) → guarda en `registro_auditoria.modificado_por_sharepoint` / `fecha_modificacion_sharepoint`.
   - Compara `hash_archivo` (ej. SHA-256 del binario) contra la última carga registrada — si no cambió, no reprocesa.
4. Reusar el parser de Fase 1 (debe funcionar tanto contra archivo local como contra el buffer descargado de Graph API — diseñar `parse-excel.ts` para aceptar un buffer, no solo un path).

### 5.2 Checklist de salida de Fase 3

- [x] Código listo: `lib/graph.ts` (token app-only, reusa `AUTH_MICROSOFT_ENTRA_ID_*` del login), `lib/sharepoint.ts` (resolver sitio/drive, listar carpeta, descargar archivo, versiones), `scripts/sync-sharepoint.ts` (`--listar` como diagnóstico, y sincronización con skip-si-no-cambió). Se extrajo la lógica de parseo/import a `scripts/importar.ts` para que la compartan `parse-excel.ts` (local) y `sync-sharepoint.ts` (remoto) sin duplicar código.
- [x] Flujo de token app-only verificado end-to-end (se obtiene token real, la llamada a Graph API responde con un error estructurado, no un fallo de autenticación) — confirma que `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET` están bien cableados para este uso.
- [x] Permiso de **aplicación** `Sites.Read.All` agregado al App Registration del login, con consentimiento de administrador otorgado (el error inicial fue agregarlo como "Delegada" en vez de "Aplicación" — son grants separados en Azure aunque compartan nombre).
- [x] `.env.local` completo con la URL real: sitio `estudioseis.sharepoint.com/sites/estudioseis.6`, carpeta `/TESORERIA/CONSOLIDADOS`.
- [x] Se descargan `CONSOLIDADO 2026.xlsx` y `CONSOLIDADO OBRAS.xlsx` reales desde SharePoint (no la copia local) y corre el mismo parser sin cambios — probado con datos reales: **5897 movimientos**, 317 requieren justificación, 0 anomalías.
- [x] La sección de auditoría guarda quién modificó el archivo por última vez y cuándo (`registro_auditoria.modificado_por_sharepoint` / `fecha_modificacion_sharepoint`), confirmado con datos reales de la API de versiones de SharePoint.
- [x] Si el archivo no cambió desde la última sincronización, no reprocesa — probado corriendo el sync dos veces seguidas: la segunda vez lo detectó y no tocó la base.

**Nota de seguridad**: `Sites.Read.All` (Aplicación) es de solo lectura a nivel de todo el tenant de `estudioseis` (Microsoft no ofrece una versión "solo esta carpeta" desde el Portal). El código (`lib/graph.ts`, `lib/sharepoint.ts`) solo hace pedidos `GET`, nunca escribe. El límite real de seguridad es el `client_secret` en `.env.local` (nunca en git, futuro: variable de entorno encriptada en Vercel). Mejora opcional futura si se quiere acotar el alcance: permiso `Sites.Selected` (requiere una llamada extra de configuración, no disponible desde el Portal directamente).

**Fase 3 completa.** Falta únicamente desplegar a Vercel (Fase 4) para que el sync corra solo, sin depender de que alguien lo dispare a mano desde una terminal local.

---

## 6. Fase 4 — Sincronización automatizada (Vercel Cron)

**Objetivo**: actualizar el dashboard automáticamente ~3 veces al día.

### 6.1 Tareas

1. `vercel.json` con `crons`: 3 horarios (ej. inicio de jornada, mediodía, cierre de cajas — a definir horario exacto con el usuario).
2. Endpoint protegido (`CRON_SECRET` de Vercel) que ejecuta: descarga SharePoint (Fase 3) → parser (Fase 1) → actualiza `registro_auditoria`.
3. Manejo de errores: si Graph API falla o el Excel tiene un error de estructura no contemplado, el cron no debe romper el dashboard existente — debe loguear y mantener los últimos datos válidos.
4. Notificación opcional (a decidir) si aparecen nuevos movimientos con `requiere_justificacion = true` tras una sincronización.

### 6.2 Checklist de salida de Fase 4

- [ ] Los 3 crons corren en horario y quedan visibles en logs de Vercel.
- [ ] Una corrida fallida no corrompe ni vacía datos ya cargados.
- [ ] El dashboard refleja datos de la sincronización más reciente exitosa.

---

## 7. Orden de trabajo recomendado

1. Fase 1 completa y verificada contra los dos Excels reales en `archivosCopiaDeConsolidados/` (sin depender aún de SharePoint).
2. Fase 2 sobre los datos ya cargados localmente en Fase 1.
3. Fase 3 recién cuando 1 y 2 funcionan end-to-end con datos locales — así se aísla cualquier bug de parseo de cualquier bug de conexión a Graph API.
4. Fase 4 al final, cuando el pipeline manual (parser + Graph API) ya es confiable corrido a mano.

No saltar de fase sin cerrar el checklist correspondiente — cada fase depende de que la anterior sea confiable, especialmente el detector de ajustes manuales (sección 1.3), que es el corazón del caso de auditoría y debe quedar sólido antes de automatizar nada.
