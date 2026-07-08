import Link from "next/link";
import { obtenerConsistenciaSaldos } from "@/lib/queries";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";

const TOLERANCIA_ARS = 1;

export default async function ErroresExcelPage() {
  const consistencia = await obtenerConsistenciaSaldos();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Errores de fórmula en el Excel</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Por cada caja se compara el saldo recalculado a partir de los movimientos importados contra el
          último valor de la columna &quot;TOTAL $&quot; del propio Excel. Esta herramienta no corrige el
          Excel — si hay una diferencia, es porque el archivo original tiene un error de fórmula (típicamente
          copiar/pegar entre hojas) y hay que revisarlo ahí.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Caja</th>
              <th className="px-3 py-2 text-right">Saldo calculado (sistema)</th>
              <th className="px-3 py-2 text-right">Saldo según Excel</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Verificado</th>
            </tr>
          </thead>
          <tbody>
            {consistencia.map((c) => {
              const diferencia = c.diferenciaArs !== null ? Number(c.diferenciaArs) : null;
              const noComparable = c.saldoExcelArs === null;
              const conDiferencia = diferencia !== null && Math.abs(diferencia) > TOLERANCIA_ARS;
              return (
                <tr key={c.cajaId} className={`border-t border-slate-100 ${conDiferencia ? "bg-rose-50/60" : ""}`}>
                  <td className="px-3 py-2">
                    <Link href={`/cajas/${c.cajaId}`} className="font-medium text-slate-950 hover:underline">
                      {c.cajaNombre}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                    {formatoMoneda(c.saldoCalculadoArs)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                    {c.saldoExcelArs !== null ? formatoMoneda(c.saldoExcelArs) : "N/D"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                    {diferencia !== null ? formatoMoneda(diferencia) : "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {noComparable ? (
                      <Badge>No comparable</Badge>
                    ) : conDiferencia ? (
                      <Badge color="rojo">Revisar en Excel</Badge>
                    ) : (
                      <Badge color="verde">OK</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {formatoFechaHora(c.verificadoEn)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
