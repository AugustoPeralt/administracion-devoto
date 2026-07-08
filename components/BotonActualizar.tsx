"use client";

import { useFormStatus } from "react-dom";

export function BotonActualizar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Actualizando..." : "Actualizar ahora"}
    </button>
  );
}
