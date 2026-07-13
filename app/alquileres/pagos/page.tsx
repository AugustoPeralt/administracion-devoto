import { obtenerMatrizPagos } from "@/lib/alquileres/consultas";
import { formatoMoneda } from "@/lib/formato";

const ESTILO_CELDA: Record<string, string> = {
  PAGADO: "bg-emerald-50 text-emerald-700",
  PARCIAL: "bg-amber-50 text-amber-700",
  PENDIENTE: "bg-rose-50 text-rose-700",
  SIN_DATOS: "bg-slate-50 text-slate-400",
};

const SIMBOLO: Record<string, string> = {
  PAGADO: "✓",
  PARCIAL: "~",
  PENDIENTE: "✗",
  SIN_DATOS: "—",
};

export default async function PagosPage() {
  const { meses, filas } = await obtenerMatrizPagos();

  const totalesPorMes = meses.map((mes) =>
    filas.reduce((acc, f) => acc + (f.celdas[mes]?.totalFacturado ?? 0), 0)
  );
  const granFacturado = filas.reduce((acc, f) => acc + f.totalFacturado, 0);
  const granPagado = filas.reduce((acc, f) => acc + f.totalPagado, 0);
  const granSaldo = granFacturado - granPagado;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Seguimiento de pagos</h1>
        <p className="text-sm text-slate-500">Canon mensual facturado vs. pagado por local.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium text-slate-500">Leyenda:</span>
        {(["PAGADO", "PARCIAL", "PENDIENTE", "SIN_DATOS"] as const).map((estado) => (
          <span key={estado} className={`rounded-md px-2 py-1 ${ESTILO_CELDA[estado]}`}>
            {SIMBOLO[estado]} {estado.replace("_", " ")}
          </span>
        ))}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          Todavía no hay datos de pagos sincronizados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">Local</th>
                {meses.map((mes) => (
                  <th key={mes} className="whitespace-nowrap px-3 py-2 text-center">
                    {mes}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right">Total facturado</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">Total pagado</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.local} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{fila.local}</td>
                  {meses.map((mes) => {
                    const celda = fila.celdas[mes];
                    if (!celda) {
                      return (
                        <td key={mes} className={`whitespace-nowrap px-3 py-2 text-center ${ESTILO_CELDA.SIN_DATOS}`}>
                          —
                        </td>
                      );
                    }
                    const monto = celda.estado === "PAGADO" ? celda.totalFacturado : celda.saldo;
                    return (
                      <td
                        key={mes}
                        className={`whitespace-nowrap px-3 py-2 text-center font-medium ${ESTILO_CELDA[celda.estado]}`}
                      >
                        {celda.estado === "SIN_DATOS" ? "—" : `${SIMBOLO[celda.estado]} ${formatoMoneda(monto)}`}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {formatoMoneda(fila.totalFacturado)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {formatoMoneda(fila.totalPagado)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums font-medium ${
                      fila.saldo > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {formatoMoneda(fila.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="whitespace-nowrap px-3 py-2 text-slate-900">Totales</td>
                {totalesPorMes.map((total, i) => (
                  <td key={meses[i]} className="whitespace-nowrap px-3 py-2 text-center text-slate-700">
                    {total > 0 ? formatoMoneda(total) : "—"}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                  {formatoMoneda(granFacturado)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                  {formatoMoneda(granPagado)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums ${
                    granSaldo > 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {formatoMoneda(granSaldo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
