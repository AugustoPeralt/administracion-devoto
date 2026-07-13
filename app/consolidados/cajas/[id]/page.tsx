import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerCajaPorId, obtenerMovimientosPorCaja } from "@/lib/queries";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { Badge } from "@/components/Badge";
import { ETIQUETAS_ANOMALIA } from "@/lib/anomalias";

const PRESETS_DIAS = [
  { dias: 1, etiqueta: "Hoy" },
  { dias: 5, etiqueta: "Últimos 5 días" },
  { dias: 7, etiqueta: "Últimos 7 días" },
  { dias: 15, etiqueta: "Últimos 15 días" },
  { dias: 30, etiqueta: "Últimos 30 días" },
];

export default async function CajaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orden?: string; dia?: string; dias?: string }>;
}) {
  const { id } = await params;
  const cajaId = Number(id);
  if (!Number.isInteger(cajaId)) notFound();

  const { orden: ordenParam, dia, dias: diasParam } = await searchParams;
  const orden = ordenParam === "asc" ? "asc" : "desc";
  const dias = diasParam ? Number(diasParam) : undefined;

  const caja = await obtenerCajaPorId(cajaId);
  if (!caja) notFound();

  const movimientos = await obtenerMovimientosPorCaja(cajaId, orden, {
    fecha: dia,
    dias: dia ? undefined : dias,
  });

  // Para armar los links conservando los otros filtros activos.
  const conOrden = (extra: string) => `${extra}${extra.includes("?") ? "&" : "?"}orden=${orden}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{caja.nombre}</h1>
        <p className="text-sm text-slate-500">
          {caja.tipo === "operativa" ? "Caja operativa" : "Caja de obra"} · {caja.archivoOrigen} ·{" "}
          {movimientos.length} movimientos
          {dia && ` · filtrado al día ${formatoFecha(dia)}`}
          {!dia && dias && ` · últimos ${dias} días`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={conOrden(`/consolidados/cajas/${cajaId}`)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            !dia && !dias
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          Todo
        </Link>
        {PRESETS_DIAS.map((p) => (
          <Link
            key={p.dias}
            href={conOrden(`/consolidados/cajas/${cajaId}?dias=${p.dias}`)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              !dia && dias === p.dias
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}

        <span className="mx-1 text-slate-300">|</span>

        <form method="GET" className="flex items-center gap-2">
          <input type="hidden" name="orden" value={orden} />
          <label className="text-sm text-slate-500" htmlFor="dia">
            Ver un día puntual:
          </label>
          <input
            id="dia"
            type="date"
            name="dia"
            defaultValue={dia ?? ""}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-slate-950"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            Ver
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {orden === "desc" ? "Mostrando las más recientes primero." : "Mostrando las más antiguas primero."}
        </p>
        <Link
          href={`/consolidados/cajas/${cajaId}?orden=${orden === "desc" ? "asc" : "desc"}${dia ? `&dia=${dia}` : ""}${
            !dia && dias ? `&dias=${dias}` : ""
          }`}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          {orden === "desc" ? "Ver más antiguas primero ↓" : "Ver más recientes primero ↑"}
        </Link>
      </div>

      {movimientos.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          No hay movimientos cargados en ese rango.
        </p>
      )}

      {movimientos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Monto ARS</th>
                <th className="px-3 py-2 text-right">Saldo acumulado</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const pendiente = m.requiereJustificacion && !m.comentarioJustificacion;
                return (
                  <tr
                    key={m.id}
                    className={`border-t border-slate-100 ${
                      pendiente ? "bg-amber-50/60" : m.anomalia ? "bg-rose-50/60" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatoFecha(m.fecha)}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {m.descripcionFinal}
                      {m.formulaOriginal && (
                        <div className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-600">
                          {m.formulaOriginal}
                        </div>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums font-medium ${
                        m.tipoMovimiento === "ingreso" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatoMoneda(m.montoArs)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                      {formatoMoneda(m.saldoAcumuladoArs)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {pendiente && <Badge color="ambar">⚠️ Requiere justificación</Badge>}
                        {m.requiereJustificacion && m.comentarioJustificacion && (
                          <Badge color="verde">Justificado</Badge>
                        )}
                        {m.anomalia && (
                          <Badge color="rojo">{ETIQUETAS_ANOMALIA[m.anomalia] ?? m.anomalia}</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
