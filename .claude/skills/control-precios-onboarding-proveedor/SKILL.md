---
name: control-precios-onboarding-proveedor
description: Usar cuando aparece un proveedor nuevo (o uno existente) en control-precios con una estructura de descuento/impuesto no estándar que no se refleja en el precio_unitario de la factura. Guía cómo modelarlo siguiendo el patrón ya validado de El Criollo/HORECA, sin asumir la fórmula.
---

# Onboarding de proveedor con descuento no estándar (control-precios)

El precedente es El Criollo/HORECA (`lib/control-precios/constantes.ts`): 10% ya
reflejado en el precio unitario de la factura + 6% adicional sobre el total con
IVA que **no aparece en ningún renglón**. Cualquier proveedor nuevo con un
mecanismo parecido se modela igual — pero la fórmula de cada proveedor es un
dato del negocio, no algo que se pueda inferir del Excel solo.

## 1. Nunca asumir la fórmula — preguntar

Antes de tocar código, confirmar con el usuario:

- ¿Sobre qué base se calcula el descuento/recargo? (precio de lista, total con
  IVA, total sin IVA, por producto o por factura completa)
- ¿Es un porcentaje fijo y estable, o varía por producto/período?
- ¿Ya está parcialmente reflejado en el `precio_unitario` de la factura (como
  el 10% de El Criollo) o no aparece en absoluto (como el 6%)?

Si la respuesta es "no sé" o "es variable", no es candidato a esta skill — ver
la sección 3.

## 2. Si el descuento es uniforme para TODOS los renglones del proveedor

Modelarlo igual que `FACTOR_PRECIO_REAL_ADICIONAL`:

1. Agregar el nombre **exacto** del proveedor (tal cual figura en
   `cp_proveedores.nombre`) a un array de "proveedores con este mecanismo" en
   `constantes.ts`, siguiendo `PROVEEDORES_CON_AJUSTE_10_6` como ejemplo si el
   mecanismo es el mismo, o uno nuevo si es distinto.
2. Agregar la constante del factor con un comentario que muestre el cálculo
   completo paso a paso (no solo el número final) — igual que el comentario de
   `FACTOR_PRECIO_REAL_ADICIONAL`, incluyendo la fecha y que fue confirmado
   por el usuario.
3. Aplicar el factor en `precioRealAjustado()` (`lib/control-precios/consultas.ts`).
4. Si el proveedor también tiene precios de **lista/cotización** (antes de
   comprar, ver `cp_listas_precios_proveedor`), agregar el equivalente
   "% de descuento sobre precio de lista" (como `DESCUENTO_LISTA_EL_CRIOLLO`)
   para poder estimar sin partir de una compra real.
5. Agregar un caso a `lib/control-precios/consultas.test.ts` con el nuevo
   proveedor (mismo formato que los tests de El Criollo/HORECA).
6. Sumar la regla nueva a `lib/control-precios/CLAUDE.md`, sección "Reglas
   frágiles", con el mismo nivel de detalle que las existentes.

## 3. Si el descuento NO es uniforme (varía por producto o por lote)

No es un caso para `constantes.ts`. Ya existe el campo `descuento` por renglón
en `cp_detalle_facturas` para bonificaciones que varían línea a línea — usar
ese mecanismo existente, no inventar uno nuevo. Si ni siquiera eso alcanza
(ej. el descuento depende de un acumulado mensual), preguntar al usuario cómo
quiere modelarlo antes de escribir código — no improvisar un esquema nuevo
para un caso de un solo proveedor.
