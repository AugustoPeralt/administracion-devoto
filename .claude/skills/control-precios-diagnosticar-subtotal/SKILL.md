---
name: control-precios-diagnosticar-subtotal
description: Usar cuando una factura o renglón de control-precios no cierra (subtotal calculado no coincide con lo esperado, o monto_total de la factura no reconcilia contra la suma de renglones). Diagnostica el alcance real antes de tocar datos y guía cómo escribir una corrección segura si hace falta.
---

# Diagnosticar inconsistencia de subtotal en control-precios

Este módulo es el de mayor precisión requerida del repo (ver
`lib/control-precios/CLAUDE.md`). Nunca corregir un número a ojo ni a partir de
una sola factura: seguir estos pasos en orden.

## 1. Medir el alcance antes de tocar nada

Correr una query de diagnóstico agrupada por proveedor (mismo patrón que
`scripts/analizar-descuentos-ocultos.ts`): comparar `monto_total` de la factura
contra la suma reconstruida de renglones (`cantidad × precio_unitario − descuento`,
o contra `subtotal_impreso` si no hay `iva_porcentaje`). Buscar si el gap es:

- **Sistemático en TODAS las facturas de un proveedor** → no es un error de
  carga, es un mecanismo de descuento/impuesto no modelado todavía (mismo
  patrón que El Criollo/HORECA o el IVA-incluido de vinos/carnes). Esto va a
  la skill `control-precios-onboarding-proveedor`, no a una corrección puntual.
- **Acotado a facturas/renglones específicos** → sí es candidato a corrección
  puntual (sección 2).

## 2. Si es una corrección puntual, escribir un script en `scripts/`

Seguir el formato de `scripts/corregir-subtotal-iva-incluido.ts`:

- **Comentario inicial obligatorio**: qué se encontró, con datos concretos
  (nombres de proveedor exactos, ids de factura, cantidad de renglones
  afectados, la fórmula del error). No alcanza con "corrige subtotales mal
  calculados" — el que lo lea en 6 meses tiene que entender el caso sin
  re-investigar.
- **`WHERE` acotado** a los proveedores/facturas identificados en el paso 1 —
  nunca un `UPDATE` sin filtrar por proveedor/factura.
- **Condición de tolerancia**: solo tocar filas donde
  `ABS(subtotal_actual - subtotal_correcto) > TOLERANCIA_SUBTOTAL` (constante
  en `lib/control-precios/constantes.ts`) — no reescribir filas que ya están
  bien dentro del margen de redondeo.
- **Nunca tocar `subtotal_impreso`** — es el dato tal cual impreso en el papel,
  se conserva siempre. Solo se recalcula `subtotal`.
- **`RETURNING` + contar filas** afectadas y loguearlo — nunca un `UPDATE`
  silencioso sin saber cuántas filas tocó.

## 3. Confirmar antes de correr contra la base real

Mostrarle al usuario el diagnóstico del paso 1 (proveedor, cantidad de filas,
fórmula) y el conteo de filas que el script va a tocar **antes** de ejecutarlo
contra la base de producción — no hay dry-run automático en este patrón, la
confirmación humana lo reemplaza.

## 4. Verificar el resultado

Después de correr la corrección, confirmar que el producto/proveedor afectado
da un delta de precio coherente con `scripts/probar-delta-precios.ts`
(transacción + `ROLLBACK`, no toca datos) antes de dar el caso por cerrado.
