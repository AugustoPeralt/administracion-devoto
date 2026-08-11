"use client";

import { confirmarComparacionRestaurantes, eliminarComparacionRevisada } from "@/app/control-precios/actions";
import type { ComparacionEntreRestaurantes, ComparacionRestauranteRevisada } from "@/lib/control-precios/consultas";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { SeccionColapsable } from "@/components/SeccionColapsable";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function FilaActiva({ c }: { c: ComparacionEntreRestaurantes }) {
  const router = useRouter();
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setError(null);
    setGuardando(true);
    try {
      await confirmarComparacionRestaurantes(
        {
          productoId: c.productoId,
          localMasBaratoId: c.localMasBaratoId,
          precioMinimo: Number(c.precioMinimo),
          fechaMasBarato: c.fechaMasBarato,
          facturaIdMasBarato: c.facturaIdMasBarato,
          localMasCaroId: c.localMasCaroId,
          precioMaximo: Number(c.precioMaximo),
          fechaMasCaro: c.fechaMasCaro,
          facturaIdMasCaro: c.facturaIdMasCaro,
          porcentajeDiferencia: Number(c.porcentajeDiferencia),
        },
        comentario
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar.");
      setGuardando(false);
    }
  }

  return (
    <tr className="border-t border-rose-100">
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{c.productoNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.proveedorNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
        <div>{c.localMasBarato}</div>
        <div className="text-xs text-slate-400">{formatoFecha(c.fechaMasBarato)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-emerald-600">{formatoMoneda(c.precioMinimo)}</div>
        <a
          href={`/api/control-precios/ver-comprobante/${c.facturaIdMasBarato}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 underline hover:text-slate-900"
        >
          Ver factura
        </a>
        {" · "}
        <Link href={`/control-precios/facturas/${c.facturaIdMasBarato}`} className="text-xs text-slate-500 underline hover:text-slate-900">
          Corregir
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
        <div>{c.localMasCaro}</div>
        <div className="text-xs text-slate-400">{formatoFecha(c.fechaMasCaro)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="font-mono tabular-nums text-rose-600">{formatoMoneda(c.precioMaximo)}</div>
        <a
          href={`/api/control-precios/ver-comprobante/${c.facturaIdMasCaro}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 underline hover:text-slate-900"
        >
          Ver factura
        </a>
        {" · "}
        <Link href={`/control-precios/facturas/${c.facturaIdMasCaro}`} className="text-xs text-slate-500 underline hover:text-slate-900">
          Corregir
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-rose-700">
        +{c.porcentajeDiferencia}%
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="text"
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
          />
          <button
            type="button"
            disabled={guardando}
            onClick={() => void confirmar()}
            title="Ya lo vi — sacar de esta lista y guardar en el archivo"
            className="whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "..." : "Confirmar"}
          </button>
        </div>
        {error && <p className="mt-1 text-right text-xs text-rose-700">{error}</p>}
      </td>
    </tr>
  );
}

function FilaArchivada({ c }: { c: ComparacionRestauranteRevisada }) {
  const router = useRouter();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    setError(null);
    setProcesando(true);
    try {
      await eliminarComparacionRevisada(c.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al quitar del archivo.");
      setProcesando(false);
    }
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{c.productoNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.proveedorNombre}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
        {c.localMasBarato} ({formatoMoneda(c.precioMinimo)}) vs {c.localMasCaro} ({formatoMoneda(c.precioMaximo)})
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">+{c.porcentajeDiferencia}%</td>
      <td className="px-3 py-2 text-slate-500">{c.comentario ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
        {c.usuarioEmail}
        <br />
        {formatoFechaHora(c.creadoEn)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button
          type="button"
          disabled={procesando}
          onClick={() => void quitar()}
          className="text-xs text-rose-500 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {procesando ? "..." : "Quitar del archivo"}
        </button>
        {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
      </td>
    </tr>
  );
}

/** "Mismo proveedor, distinto precio entre restaurantes": la alerta activa
 * (obtenerComparacionEntreRestaurantes) más el archivo de casos ya confirmados
 * (obtenerComparacionesRestaurantesRevisadas) — confirmar un caso lo saca de la
 * alerta y lo guarda en el archivo sin perder el dato. Ver
 * confirmarComparacionRestaurantes en actions.ts para el criterio de "misma
 * situación" (producto + par de locales) que decide cuándo vuelve a aparecer. */
export function TablaComparacionRestaurantes({
  activos,
  archivados,
}: {
  activos: ComparacionEntreRestaurantes[];
  archivados: ComparacionRestauranteRevisada[];
}) {
  if (activos.length === 0 && archivados.length === 0) return null;

  return (
    <div className="space-y-3">
      {activos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-rose-200 bg-rose-50 shadow-sm">
          <div className="px-4 pt-3">
            <h2 className="text-sm font-semibold text-rose-900">
              Mismo proveedor, distinto precio entre restaurantes ({activos.length})
            </h2>
            <p className="mb-2 text-xs text-rose-700">
              Compara el último precio conocido por restaurante — solo cuando las dos compras están a una semana o
              menos de diferencia entre sí, para no confundir un precio distinto con un dato desactualizado. Podés
              abrir el comprobante de cada lado para comparar a simple vista, o &quot;Confirmar&quot; para sacarlo de
              acá y guardarlo en el archivo de abajo.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-rose-700">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Más barato en</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Más caro en</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Diferencia</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {activos.map((c) => (
                <FilaActiva key={`${c.productoId}-${c.localMasBaratoId}-${c.localMasCaroId}`} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archivados.length > 0 && (
        <SeccionColapsable titulo={`Comparaciones confirmadas (${archivados.length})`} defaultAbierta={false}>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Precios al confirmar</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                  <th className="px-3 py-2">Comentario</th>
                  <th className="px-3 py-2">Quién / cuándo</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {archivados.map((c) => (
                  <FilaArchivada key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        </SeccionColapsable>
      )}
    </div>
  );
}
