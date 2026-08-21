// Único lugar donde vive este array — actions.ts es "use server" y solo puede
// exportar funciones async, no esta constante, así que cualquier componente
// cliente que la necesite (selects, filtros) la importa de acá.
export const CATEGORIAS_INSUMO = ["CARNE", "PESCADERIA", "ALMACEN", "VERDULERIA", "BEBIBLES", "DESCARTABLES"] as const;

// A partir de este % de aumento, una fila se resalta como alerta fuerte — usado
// tanto en la pantalla de Reportes como en el export a Excel, para que se vea
// exactamente lo mismo resaltado en los dos lugares.
export const UMBRAL_ALERTA_PRECIO = 15;

// A partir de este % de aumento entre una importación de lista de precios y la
// anterior (ver obtenerDeltaListaMismoProveedor en consultas.ts), se buscan
// automáticamente sustitutos más baratos del mismo proveedor para ese producto
// (ver cp_sustitutos_producto) — deliberadamente mucho más bajo que
// UMBRAL_ALERTA_PRECIO: acá no estamos resaltando un aumento grave, sino
// ofreciendo una alternativa ante CUALQUIER aumento que valga la pena mirar.
// Decisión del usuario (2026-07-28).
export const UMBRAL_RECOMENDACION_SUSTITUTO = 1;

// Tolerancia (en pesos) para considerar que el subtotal calculado (cantidad ×
// precio_unitario − descuento) "coincide" con el subtotal impreso en el papel —
// solo cubre redondeo de centavos, no una diferencia real. Ver
// obtenerHistorialComprasPorProducto(): cuando un ítem tiene descuento propio, el
// gasto de ese renglón solo se cuenta como verificado si ambos números coinciden
// dentro de esta tolerancia; si no, se excluye del gasto "confiable" y se muestra
// aparte como sin verificar. Decisión del usuario: mostrar plata que no se puede
// comprobar contra el original es peor que no mostrarla.
export const TOLERANCIA_SUBTOTAL = 1;

// Nombres exactos tal cual están en cp_proveedores — identifican a los dos
// proveedores que facturan con el 10%+6% (ver FACTOR_PRECIO_REAL_ADICIONAL)
// para aplicarles la corrección al precio real y a la estimación de lista.
export const NOMBRE_PROVEEDOR_EL_CRIOLLO = "Distribuidora El Criollo SRL";
export const NOMBRE_PROVEEDOR_HORECA = "HORECA SRL";
export const PROVEEDORES_CON_AJUSTE_10_6 = [NOMBRE_PROVEEDOR_EL_CRIOLLO, NOMBRE_PROVEEDOR_HORECA];

// El Criollo y HORECA aplican dos descuentos: 10% sobre el precio de lista
// (SÍ queda reflejado en el precio_unitario de la factura real) más un 6%
// adicional sobre el TOTAL de cada factura (con IVA incluido) que nunca
// aparece en ningún precio unitario, ni de lista ni de factura — no lo
// facturan por ítem. El 6% no se puede prorratear por producto de forma
// verificable línea por línea, pero el usuario confirmó (2026-07-23) que el
// precio "real" del producto —para todo lo que se compara/reporta de acá en
// adelante— sí debe reflejar los dos descuentos combinados:
//   precio_lista × (1 − 0.10) × (1 − 0.06) = precio_lista × 0.846
// Como el precio_unitario que ya tenemos SIEMPRE viene con el 10% aplicado
// (precio_lista × 0.90), alcanza con multiplicarlo por 0.94 para llegar
// exacto al 0.846 de precio_lista — restarle el 6% que todavía le faltaba,
// nunca sumarle nada. FACTOR_PRECIO_REAL_ADICIONAL es ese 0.94.
export const FACTOR_PRECIO_REAL_ADICIONAL = 0.94;

// Mismo 0.846 de arriba, pero expresado como "% de descuento sobre precio de
// lista" para cuando hay que ESTIMAR desde el Excel de cotización (producto
// que todavía no se compró, sin precio_unitario real de qué partir).
export const DESCUENTO_LISTA_EL_CRIOLLO = 15.4;

// Para "mismo proveedor, distinto precio entre restaurantes" (ver
// obtenerComparacionEntreRestaurantes): si las dos facturas que se comparan
// (la del local más barato y la del más caro) están separadas por más de
// esto, la diferencia de precio no es comprobable — puede ser simplemente que
// a uno de los dos locales le falte cargar una compra más reciente de ese
// producto, no que el proveedor le cobre distinto hoy. Decisión del usuario:
// mismo criterio que el resto del sistema, no mostrar una diferencia que en
// realidad puede explicarse por datos desactualizados.
export const DIAS_MAX_DIFERENCIA_COMPARACION_RESTAURANTES = 7;
