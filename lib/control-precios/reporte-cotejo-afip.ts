// Formateo de texto a partir de un ResultadoCotejo — sin ninguna dependencia de
// servidor (nada de "@/db"), a propósito: lo importa un componente cliente
// (CotejoAfipForm) para generar el texto copiable, y cotejo-afip.ts importa `db`
// para las consultas — si este helper viviera ahí, el bundle del cliente
// arrastraría esa importación y rompería en el navegador.
import type { ResultadoCotejo } from "./cotejo-afip";

function formatoFechaDDMMYYYY(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatoPlata(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

/** Texto plano listo para copiar y pegar (ej. al grupo de WhatsApp de un
 * encargado) con las facturas que AFIP registra y no se encontraron entre las
 * cargadas — no incluye las "identificadas por monto y fecha" (esas ya se
 * consideran la misma factura, no hace falta pedirlas de nuevo). */
export function construirReporteFaltantes(resultado: ResultadoCotejo): string {
  const conFaltantes = resultado.filas.filter((f) => f.faltantes.length > 0);
  if (conFaltantes.length === 0) {
    return `Facturas faltantes — ${resultado.local.nombre} — período ${resultado.periodo}\n\nNo falta ninguna factura de las registradas en AFIP para este período.`;
  }

  const lineas = [`Facturas faltantes — ${resultado.local.nombre} — período ${resultado.periodo}`, ""];
  for (const f of conFaltantes) {
    lineas.push(`${f.nombre} — ${f.faltantes.length} factura(s):`);
    for (const x of f.faltantes) {
      lineas.push(`  - ${x.numero} (${formatoFechaDDMMYYYY(x.fecha)}) ${formatoPlata(x.importe)}`);
    }
    lineas.push("");
  }
  lineas.push(`Total: ${resultado.totales.comprobantesFaltantes} factura(s) faltante(s) por ${formatoPlata(resultado.totales.montoFaltante)}`);
  return lineas.join("\n");
}
