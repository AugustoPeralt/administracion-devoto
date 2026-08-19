"use client";

import { useState, type FormEvent } from "react";
import { cotejarAfip, type RespuestaCotejoAfip } from "@/app/control-precios/cotejo-afip/actions";
import { construirReporteFaltantes } from "@/lib/control-precios/reporte-cotejo-afip";
import type { EstadoCotejo, FilaCotejo, ResultadoCotejo } from "@/lib/control-precios/cotejo-afip";

const ESTADO_CONFIG: Record<EstadoCotejo, { texto: string; clase: string }> = {
  FALTAN_FACTURAS: { texto: "Faltan facturas", clase: "bg-rose-50 text-rose-700" },
  CARGADAS_DE_MAS: { texto: "Cargadas sin match en AFIP", clase: "bg-amber-50 text-amber-700" },
  OK: { texto: "Coincide", clase: "bg-emerald-50 text-emerald-700" },
};

function formatoPlata(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export function CotejoAfipForm({ locales }: { locales: { id: number; nombre: string }[] }) {
  const [localId, setLocalId] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaCotejoAfip | null>(null);

  const nombreLocal = locales.find((l) => l.id === localId)?.nombre ?? "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!archivo || !localId) return;
    setCargando(true);
    setRespuesta(null);
    try {
      const formData = new FormData();
      formData.set("archivo", archivo);
      formData.set("localId", String(localId));
      formData.set("localNombre", nombreLocal);
      if (periodo) formData.set("periodo", periodo);
      const res = await cotejarAfip(formData);
      setRespuesta(res);
    } catch (err) {
      setRespuesta({ ok: false, error: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Restaurante</label>
          <select
            value={localId ?? ""}
            onChange={(e) => setLocalId(e.target.value ? Number(e.target.value) : null)}
            className="w-56 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          >
            <option value="">Elegí un restaurante...</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Período (opcional)</label>
          <input
            type="text"
            placeholder="AAAA-MM"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="w-32 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Excel de ARCA (Mis Comprobantes Recibidos)</label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="w-72 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <button
          type="submit"
          disabled={!archivo || !localId || cargando}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cargando ? "Cotejando..." : "Cotejar"}
        </button>
      </form>

      {respuesta && !respuesta.ok && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{respuesta.error}</div>
      )}

      {respuesta?.ok && <ResultadoView resultado={respuesta.resultado} />}
    </div>
  );
}

function ResultadoView({ resultado }: { resultado: ResultadoCotejo }) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  function toggle(cuit: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(cuit)) next.delete(cuit);
      else next.add(cuit);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p>
          <strong className="text-slate-900">{resultado.local.nombre}</strong> — período{" "}
          <strong className="text-slate-900">{resultado.periodo}</strong> — CUIT receptor en el excel:{" "}
          <strong className="text-slate-900">{resultado.cuitReceptorExcel}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {resultado.totalComprobantesExcel} comprobante(s) en el excel
          {resultado.totalFueraDePeriodo > 0 && ` (${resultado.totalFueraDePeriodo} fuera del período, ignorados)`}
        </p>
      </div>

      {resultado.totales.comprobantesFaltantes > 0 && <ReporteFaltantesCopiable resultado={resultado} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica etiqueta="Proveedores con diferencia" valor={String(resultado.totales.proveedoresConDiferencia)} tono="rose" />
        <Metrica etiqueta="Proveedores OK" valor={String(resultado.totales.proveedoresOk)} tono="emerald" />
        <Metrica etiqueta="Facturas faltantes" valor={String(resultado.totales.comprobantesFaltantes)} tono="rose" />
        <Metrica etiqueta="Monto faltante" valor={formatoPlata(resultado.totales.montoFaltante)} tono="rose" />
      </div>

      {resultado.proveedoresSinCuit.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {resultado.proveedoresSinCuit.length} proveedor(es) de este local no tienen CUIT cargado — nunca se van a
          poder cruzar automáticamente hasta completarles el CUIT en /control-precios/proveedores:{" "}
          {resultado.proveedoresSinCuit.join(", ")}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {resultado.filas.map((fila) => (
          <FilaProveedor key={fila.cuit} fila={fila} expandido={expandido.has(fila.cuit)} onToggle={() => toggle(fila.cuit)} />
        ))}
      </div>

      {resultado.ajustes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-700">Notas de Crédito/Débito en AFIP (informativo)</p>
          <p className="mb-2 text-xs text-slate-400">No se cruzan contra las facturas cargadas.</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {resultado.ajustes.map((a) => (
              <li key={a.cuit}>
                {a.nombre} (CUIT {a.cuit}): {a.cantidad} nota(s), {formatoPlata(a.montoTotal)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metrica({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: "rose" | "emerald" }) {
  const clase = tono === "rose" ? "text-rose-700" : "text-emerald-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-400">{etiqueta}</p>
      <p className={`text-xl font-semibold ${clase}`}>{valor}</p>
    </div>
  );
}

function FilaProveedor({ fila, expandido, onToggle }: { fila: FilaCotejo; expandido: boolean; onToggle: () => void }) {
  const { texto, clase } = ESTADO_CONFIG[fila.estado];
  const tieneDetalle = fila.faltantes.length > 0 || fila.identificadasPorMontoYFecha.length > 0 || fila.cargadasSinMatch.length > 0;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={tieneDetalle ? onToggle : undefined}
        className={`flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left ${tieneDetalle ? "cursor-pointer hover:bg-slate-50" : ""}`}
      >
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>{texto}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{fila.nombre}</span>
        <span className="text-xs text-slate-400">CUIT {fila.cuit}</span>
        <span className="text-xs text-slate-600">
          AFIP {fila.cantAfip} / Cargado {fila.cantCargada}
        </span>
        <span className="text-xs text-slate-600">
          {formatoPlata(fila.montoAfip)} / {formatoPlata(fila.montoCargado)}
        </span>
        {tieneDetalle && <span className="text-xs text-slate-400">{expandido ? "▲" : "▼"}</span>}
      </button>

      {expandido && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          {fila.faltantes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-rose-700">Facturas de AFIP que no se encontraron entre las cargadas — pedirlas:</p>
              <ul className="space-y-0.5 text-xs text-slate-600">
                {fila.faltantes.map((f) => (
                  <li key={f.numero}>
                    {f.numero} — {f.fecha} — {formatoPlata(f.importe)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fila.identificadasPorMontoYFecha.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">
                Identificadas por monto y fecha exactos (sin número de comprobante cargado — se toman como la misma factura):
              </p>
              <ul className="space-y-0.5 text-xs text-slate-500">
                {fila.identificadasPorMontoYFecha.map((f) => (
                  <li key={f.numero}>
                    {f.numero} — {f.fecha} — {formatoPlata(f.importe)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fila.cargadasSinMatch.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-amber-700">Cargadas en el sistema que no aparecen en AFIP este período:</p>
              <ul className="space-y-0.5 text-xs text-slate-600">
                {fila.cargadasSinMatch.map((f, i) => (
                  <li key={i}>
                    {f.fecha} — {formatoPlata(f.monto)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReporteFaltantesCopiable({ resultado }: { resultado: ResultadoCotejo }) {
  const [mostrar, setMostrar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const texto = construirReporteFaltantes(resultado);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-slate-700">
          Reporte para pedirle al encargado — {resultado.totales.comprobantesFaltantes} factura(s) faltante(s)
        </p>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {mostrar ? "Ocultar" : "Ver texto"}
        </button>
        <button
          type="button"
          onClick={() => void copiar()}
          className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      {mostrar && (
        <textarea
          readOnly
          value={texto}
          rows={12}
          className="mt-3 w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 outline-none"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
