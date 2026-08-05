import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarNombreProducto,
  primerDiaDelMes,
  nombreBaseComercial,
  sonNombresSimilares,
  sonSustitutosPorMarca,
  extraerCantidad,
  esCuitValido,
  limpiarCodigoLoteFactura,
} from "./normalizar";

test("normalizarNombreProducto: ignora tildes, mayúsculas y espacios repetidos", () => {
  assert.equal(normalizarNombreProducto("  Papa   Andina  "), "papa andina");
  assert.equal(normalizarNombreProducto("Jamón Crudo"), "jamon crudo");
});

test("primerDiaDelMes: no se corre de mes por zona horaria", () => {
  assert.equal(primerDiaDelMes("2026-07-15"), "2026-07-01");
  assert.equal(primerDiaDelMes("2026-01-31"), "2026-01-01");
});

test("limpiarCodigoLoteFactura: quita el código de lote/origen pegado al final (caso real)", () => {
  assert.equal(
    limpiarCodigoLoteFactura("CAFE EN GRANO TIERRA INTENSO X 1 KG ITALIA 25 001 IC04 042117 J Origen:ITALIA"),
    "CAFE EN GRANO TIERRA INTENSO X 1 KG ITALIA"
  );
  assert.equal(
    limpiarCodigoLoteFactura("TOMATE PERITA ITALIANO LA BIANCA X 2.55 KG 25.001 IC04 126394 T Origen: ITALIA"),
    "TOMATE PERITA ITALIANO LA BIANCA X 2.55 KG"
  );
});

test("limpiarCodigoLoteFactura: no toca nombres sin código de lote", () => {
  assert.equal(limpiarCodigoLoteFactura("CAFE EN GRANO TIERRA INTENSO X 1 KG ITALIA"), "CAFE EN GRANO TIERRA INTENSO X 1 KG ITALIA");
  assert.equal(limpiarCodigoLoteFactura("PARMESANO VAQUERO KG SIN GLUTEN"), "PARMESANO VAQUERO KG SIN GLUTEN");
});

test("nombreBaseComercial: quita sufijos societarios y puntuación", () => {
  assert.equal(nombreBaseComercial("Distribuidora El Criollo SRL"), "distribuidora el criollo");
  assert.equal(nombreBaseComercial("HORECA S.A."), "horeca");
});

test("nombreBaseComercial: normaliza apóstrofos de Hellmann's (caso real)", () => {
  const variantes = ["Hellmann's", "Hellmann 's", "Hellmann´s"];
  const bases = variantes.map(nombreBaseComercial);
  assert.ok(bases.every((b) => b === bases[0]), "las tres variantes deben converger a la misma base");
});

test("sonNombresSimilares: detecta que uno contiene al otro tras normalizar", () => {
  assert.ok(sonNombresSimilares("Distribuidora El Criollo SRL", "El Criollo"));
  assert.ok(sonNombresSimilares("HORECA SRL", "Horeca S.A."));
});

test("sonNombresSimilares: no matchea proveedores distintos", () => {
  assert.ok(!sonNombresSimilares("Distribuidora El Criollo SRL", "El Emporio de Lanús S.A."));
});

test("sonNombresSimilares: descarta bases demasiado cortas para evitar falsos positivos", () => {
  // Tras sacar sufijos societarios, "SA" y "SA Comercial" quedarían vacías/cortas.
  assert.ok(!sonNombresSimilares("S.A.", "S.A. Comercial"));
});

test("sonSustitutosPorMarca: acepta misma variante, distinta marca (caso real)", () => {
  assert.ok(
    sonSustitutosPorMarca("DULCE DE LECHE REPOSTERO BALDE VACALIN 10 KG", "DULCE DE LECHE REPOSTERO MILKAUT X 10 KG S/GLUTEN")
  );
});

test("sonSustitutosPorMarca: acepta cuando la unidad va suelta y con distinta forma (GR vs GRS)", () => {
  // Caso real que se nos escapó: "836 GR" vs "850 GRS" — la unidad suelta de
  // 3+ letras (GRS) no fusionada con el número no se filtraba y hacía parecer
  // que tenían distinta cantidad de palabras.
  assert.ok(sonSustitutosPorMarca("ANANA EN RODAJAS CUMANA X 836 GR", "ANANA EN RODAJAS FRUTO DE LA CONFIANZA X 850 GRS"));
});

test("sonSustitutosPorMarca: rechaza distinta variante aunque comparta marca y tipo", () => {
  // Repostero y Familiar son variantes distintas de dulce de leche, ambas Vacalín — no son intercambiables.
  assert.ok(
    !sonSustitutosPorMarca("DULCE DE LECHE REPOSTERO BALDE VACALIN 10 KG", "DULCE DE LECHE FAMILIAR VACALIN BALDE 10K S/GLUTEN")
  );
});

test("sonSustitutosPorMarca: rechaza distinta variante aunque comparta palabras de tipo", () => {
  // Mismo caso que preocupó al usuario: Repostero vs Clásico no son el mismo producto.
  assert.ok(!sonSustitutosPorMarca("DULCE DE LECHE REPOSTERO VACALIN X 10 KG", "DULCE DE LECHE CLASICO VACALIN X 10 KG"));
});

test("sonSustitutosPorMarca: acepta mismo tipo+variante, distinta marca (leche descremada)", () => {
  assert.ok(
    sonSustitutosPorMarca("LECHE LA SERENISIMA DESCREMADA X 1 LT SIN GLUTEN", "LECHE TREGAR DESCREMADA X 1 LT SIN GLUTEN")
  );
});

test("sonSustitutosPorMarca: rechaza mismo producto, distinto tipo de leche (entera vs descremada)", () => {
  assert.ok(
    !sonSustitutosPorMarca("LECHE LA SERENISIMA DESCREMADA X 1 LT SIN GLUTEN", "LECHE LA SERENISIMA ENTERA X 1 LT SIN GLUTEN")
  );
});

test("sonSustitutosPorMarca: rechaza productos sin relación", () => {
  assert.ok(!sonSustitutosPorMarca("DULCE DE LECHE FAMILIAR VACALIN BALDE 10K", "PAPA ANDINA X 25 KG"));
});

test("sonSustitutosPorMarca: rechaza cuando el envase es de tamaño muy distinto", () => {
  assert.ok(
    !sonSustitutosPorMarca("DULCE DE LECHE COLONIAL SERENISIMA X 1KG S/GLUTEN", "DULCE DE LECHE FAMILIAR VACALIN BALDE 10K S/GLUTEN")
  );
});

test("extraerCantidad: reconoce número pegado o separado de la unidad", () => {
  assert.deepEqual(extraerCantidad("DULCE DE LECHE FAMILIAR VACALIN BALDE 10K S/GLUTEN"), { valor: 10000, familia: "peso" });
  assert.deepEqual(extraerCantidad("DULCE DE LECHE REPOSTERO BALDE VACALIN 10 KG"), { valor: 10000, familia: "peso" });
  assert.deepEqual(extraerCantidad("AZUCAR INDIVIDUAL EL CRIOLLO X 800 UDS SIN GLUTEN"), { valor: 800, familia: "conteo" });
});

test("extraerCantidad: null cuando no reconoce ninguna cantidad", () => {
  assert.equal(extraerCantidad("PIMIENTA NEGRA EN GRANO LOS VALLES X KG"), null);
});

test("esCuitValido: acepta un CUIT con dígito verificador correcto", () => {
  assert.equal(esCuitValido("20-12345678-6"), true);
});

test("esCuitValido: rechaza un dígito verificador incorrecto", () => {
  assert.equal(esCuitValido("20-12345678-9"), false);
});

test("esCuitValido: rechaza longitudes inválidas", () => {
  assert.equal(esCuitValido("20-1234-6"), false);
  assert.equal(esCuitValido(""), false);
});
