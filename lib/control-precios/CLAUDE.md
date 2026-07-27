# control-precios — módulo de mayor precisión requerida

Compara precios entre proveedores y detecta aumentos a partir de facturas cargadas
(muchas vía extracción por IA/Gemini). Es el módulo con más desarrollo activo del
repo y el que la dirección usa directamente para decisiones de negocio (ya se usó
para poner un ultimátum a proveedores por aumentos). Un error acá no es cosmético:
cambia el número que ve la jefa. Tratar con el mismo cuidado que `consolidados`
(tesorería).

Modelo de datos completo y comentado en `db/schema.ts` (tablas `cp_*`) — no
duplicar esa documentación acá, solo las reglas que cruzan varios archivos.

## Reglas frágiles (no derivables de un solo archivo)

- **Ajuste 10%+6% de El Criollo / HORECA** (`constantes.ts`): estos dos
  proveedores tienen un 6% de descuento adicional sobre el total con IVA que
  **nunca aparece en ningún precio unitario** de factura ni de lista. El
  `precio_unitario` real ya trae el 10% aplicado; `precioRealAjustado()` en
  `consultas.ts` multiplica por `FACTOR_PRECIO_REAL_ADICIONAL` (0.94) para
  llegar al precio real combinado. Si se agrega un proveedor nuevo con un
  mecanismo de descuento parecido, **no asumir la fórmula — confirmarla con el
  usuario** y seguir el mismo patrón (constante + comentario con el cálculo
  explícito, no un número mágico suelto).
- **`subtotal` vs `subtotalImpreso`** (`cp_detalle_facturas`): `subtotal` es
  SIEMPRE `cantidad × precio_unitario − descuento`, calculado por el sistema —
  es lo único que se usa para comparar precios en el tiempo. `subtotalImpreso`
  es el total tal cual lo imprime el papel (puede incluir IVA/Impuestos
  Internos) y es solo informativo. Cuando los dos no coinciden dentro de
  `TOLERANCIA_SUBTOTAL` (redondeo de centavos, no una diferencia real), el
  ítem NO se pisa — se marca `verificadoManual` aparte si una persona lo validó
  por otro medio. Nunca "arreglar" un descuadre sobrescribiendo `subtotalImpreso`.
- **`cp_pares_precios_proveedores.confirmado`**: distingue un par de productos
  entre proveedores ya validado por una persona de una sugerencia (de IA o
  heurística) sin revisar. Solo `confirmado = true` entra a la comparación de
  precios — nunca usar una sugerencia sin confirmar en un cálculo.
- **Umbrales de negocio, todos en `constantes.ts`** (única fuente de verdad,
  no hardcodear en otro lado): `UMBRAL_ALERTA_PRECIO` (15%, resalta aumentos
  fuertes en Reportes y en el export a Excel — deben verse igual en los dos
  lugares), `TOLERANCIA_SUBTOTAL` (1 peso), `DIAS_MAX_DIFERENCIA_COMPARACION_RESTAURANTES`
  (7 días — si las facturas comparadas entre restaurantes están más separadas
  que esto, la diferencia puede ser un dato desatualizado, no una diferencia
  real de precio; decisión del usuario: no mostrar una diferencia que no se
  puede comprobar).
- **Matching de nombres es una heurística, nunca la decisión final**
  (`normalizar.ts`: `nombreBaseComercial` + `sonNombresSimilares`). Se usa para
  sugerir fusiones de proveedores/productos duplicados y para sugerir pares
  entre catálogos de proveedores distintos (0 coincidencias exactas entre El
  Criollo y El Emporio, confirmado con datos reales) — la fusión o el par
  siempre lo confirma una persona.
- **Historial de listas de precios (`cp_listas_precios_importaciones`/`historial`)**:
  `cp_listas_precios_proveedor` sigue siendo "estado vigente" (se pisa en cada
  import, upsert por código). Desde 2026-07-27, cada import ADEMÁS graba un
  snapshot append-only aparte (nunca se borra) para poder comparar la lista
  de un proveedor en dos fechas distintas — ver `obtenerDeltaListaMismoProveedor()`
  en `consultas.ts`, que compara la última importación contra la anterior por
  `codigoProveedor` (estable entre versiones de la lista de un mismo
  proveedor, a diferencia del nombre). Filtra a `productoId IS NOT NULL`
  (decisión del usuario: solo productos ya vinculados a nuestro catálogo,
  o sea que la empresa realmente compra — no cualquier renglón del catálogo
  del proveedor). Si se toca `importarLista()` (en `app/control-precios/comparacion/actions.ts`
  y en `scripts/importar-listas-precios.ts`, que deben mantenerse en paralelo),
  no olvidar grabar también el snapshot histórico, o el próximo delta va a
  salir vacío.
- **La IA de extracción (`procesarComprobante`/`reanalizarFacturaInterno`,
  Gemini) se equivoca en dígitos de fotos de mala calidad** — sobre todo años
  y días de fecha. Ver `obtenerFacturasConFechaSospechosa()` (detecta facturas
  con año que no coincide con el actual o fecha futura) y `esCuitValido()`
  (descarta CUITs matemáticamente imposibles). Ninguna de las dos corrige
  sola: listan para que una persona revise la foto original.

## Storage de comprobantes: R2 (nuevo) + Vercel Blob (legado)

Desde 2026-07, las subidas nuevas van a **Cloudflare R2** (`lib/control-precios/r2.ts`),
no a Vercel Blob — el free tier de Blob es 1GB y a ~2000 facturas/mes se llena en
semanas; R2 da 10GB gratis + $0.015/GB después, sin cargo por transferencia.

- `cp_facturas.archivo_url` tiene **dos formatos conviviendo**, sin columna aparte
  que los distinga: una URL completa (`https://...`) es una factura vieja que
  sigue en Vercel Blob sin migrar; una clave relativa (`facturas/<uuid>.ext`) es
  una factura nueva en R2. `esClaveR2()` en `lib/control-precios/r2.ts` es la
  única fuente de verdad para esa distinción — úsala en cualquier código nuevo
  que lea `archivo_url`, no reinventar el chequeo.
- Los tres puntos que leen/escriben el comprobante (`procesarComprobante`/
  `reanalizarFacturaInterno` en `actions.ts`, y el proxy de
  `app/api/control-precios/ver-comprobante/[facturaId]/route.ts`) ya manejan
  los dos formatos. El endpoint de subida (`app/api/control-precios/r2-presign/route.ts`)
  solo genera URLs firmadas para R2 — no hay endpoint nuevo de subida a Blob,
  ese camino quedó descontinuado para facturas nuevas.
- Las facturas viejas en Vercel Blob **no se migraron** (son ~11% del cupo
  gratis, no había apuro) — si en algún momento se decide migrarlas todas a R2
  para unificar, hay que actualizar `archivo_url` de esas filas a la nueva
  clave de R2 después de copiar el archivo, no antes.

## Testing

- Funciones puras cubiertas con `node:test` en `consultas.test.ts` y
  `normalizar.test.ts` (mismo patrón que `lib/alquileres/*.test.ts`):
  `precioRealAjustado`, `parseLocalIds`, `agruparPosiblesDuplicados`,
  `agruparPosiblesProductosDuplicados`, y todo `normalizar.ts`.
- La lógica que toca la base (`obtenerDeltaPrecios`,
  `obtenerComparacionEntreRestaurantes`, `confirmarFactura`, fusiones) **no**
  tiene tests automatizados — se verifica a mano con los scripts
  `scripts/probar-*.ts`, que arman datos de prueba dentro de una transacción y
  hacen `ROLLBACK` contra la base real (ver `Ejecutor` en `consultas.ts`). Ese
  es el patrón existente de este repo para verificar lógica de DB, no hay
  mocks de Drizzle en ningún lado — no introducir uno nuevo sin necesidad.
- Antes de cambiar cualquier cálculo de precio, correr `npm test` y, si el
  cambio toca una de las funciones sin cobertura automática de arriba, correr
  el script `probar-*.ts` correspondiente (o pedir al usuario que confirme el
  resultado contra un caso real) antes de darlo por bueno.
