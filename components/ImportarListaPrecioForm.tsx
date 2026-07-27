"use client";

import { useActionState } from "react";

type ResultadoImportacion = { archivo: string; filasImportadas: number; productosVinculados: number };
type Estado = { resultado: ResultadoImportacion | null; error: string | null };

const ESTADO_INICIAL: Estado = { resultado: null, error: null };

export function ImportarListaPrecioForm({
  titulo,
  extensionesAceptadas,
  accion,
}: {
  titulo: string;
  extensionesAceptadas: string;
  accion: (formData: FormData) => Promise<ResultadoImportacion>;
}) {
  const [estado, formAction, pending] = useActionState(async (_prev: Estado, formData: FormData): Promise<Estado> => {
    try {
      const resultado = await accion(formData);
      return { resultado, error: null };
    } catch (err) {
      return { resultado: null, error: err instanceof Error ? err.message : "Error al importar el archivo." };
    }
  }, ESTADO_INICIAL);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-900">{titulo}</p>
      <form action={formAction}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="archivo"
            accept={extensionesAceptadas}
            required
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Importando..." : "Importar lista"}
          </button>
        </div>
      </form>

      {estado.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{estado.error}</div>
      )}

      {estado.resultado && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">Importación completa: {estado.resultado.archivo}</p>
          <p className="mt-1 text-emerald-700">
            {estado.resultado.filasImportadas} productos leídos — {estado.resultado.productosVinculados} vinculados
            automáticamente a un producto que ya compraron (nombre idéntico).
          </p>
        </div>
      )}
    </div>
  );
}
