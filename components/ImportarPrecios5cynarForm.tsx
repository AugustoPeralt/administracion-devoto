"use client";

import { useActionState } from "react";
import { importarPrecios5cynar } from "@/app/control-precios/verduleria/actions";

type ResultadoImportacion = Awaited<ReturnType<typeof importarPrecios5cynar>>;
type Estado = { resultado: ResultadoImportacion | null; error: string | null };

const ESTADO_INICIAL: Estado = { resultado: null, error: null };

export function ImportarPrecios5cynarForm() {
  const [estado, formAction, pending] = useActionState(async (_prev: Estado, formData: FormData): Promise<Estado> => {
    try {
      const resultado = await importarPrecios5cynar(formData);
      return { resultado, error: null };
    } catch (err) {
      return { resultado: null, error: err instanceof Error ? err.message : "Error al importar el archivo." };
    }
  }, ESTADO_INICIAL);

  return (
    <div className="space-y-4">
      <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-xs text-slate-500">
          Archivo de precios de 5cynar (.xlsx) — una fila por producto, una columna por mes
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="archivo"
            accept=".xlsx"
            required
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Importando..." : "Importar precios"}
          </button>
        </div>
      </form>

      {estado.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{estado.error}</div>
      )}

      {estado.resultado && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Importación completa: {estado.resultado.archivo}</p>
          <ul className="mt-2 space-y-1 text-emerald-700">
            <li>Meses detectados: {estado.resultado.mesesDetectados.join(", ") || "ninguno"}</li>
            <li>Filas de producto leídas: {estado.resultado.filasLeidas}</li>
            <li>Precios insertados/actualizados: {estado.resultado.preciosImportados}</li>
          </ul>
          {estado.resultado.filasSinDatos.length > 0 && (
            <p className="mt-2 text-amber-700">
              Filas con nombre de producto pero sin ningún precio cargado en ningún mes (fila del Excel):{" "}
              {estado.resultado.filasSinDatos.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
