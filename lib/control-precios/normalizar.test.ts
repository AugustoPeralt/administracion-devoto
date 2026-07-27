import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarNombreProducto,
  primerDiaDelMes,
  nombreBaseComercial,
  sonNombresSimilares,
  esCuitValido,
} from "./normalizar";

test("normalizarNombreProducto: ignora tildes, mayúsculas y espacios repetidos", () => {
  assert.equal(normalizarNombreProducto("  Papa   Andina  "), "papa andina");
  assert.equal(normalizarNombreProducto("Jamón Crudo"), "jamon crudo");
});

test("primerDiaDelMes: no se corre de mes por zona horaria", () => {
  assert.equal(primerDiaDelMes("2026-07-15"), "2026-07-01");
  assert.equal(primerDiaDelMes("2026-01-31"), "2026-01-01");
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
