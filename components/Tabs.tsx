"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TabDef = {
  valor: string;
  etiqueta: string;
  contador?: number;
};

/** Nav de pestañas que guarda el tab activo en la URL (`?tab=...`), preservando
 * el resto de los searchParams (filtros de fecha/local/proveedor/categoría) —
 * mismo patrón que FiltrosReportePrecios, para que la página siga siendo un
 * Server Component y el tab activo sobreviva a refresh/compartir link. */
export function Tabs({ tabs, activo, paramName = "tab" }: { tabs: TabDef[]; activo: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function cambiar(valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, valor);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const seleccionado = t.valor === activo;
        return (
          <button
            key={t.valor}
            type="button"
            onClick={() => cambiar(t.valor)}
            aria-current={seleccionado ? "page" : undefined}
            className={`flex items-center gap-2 rounded-t-md px-4 py-2.5 text-sm font-medium transition-colors ${
              seleccionado
                ? "border-b-2 border-slate-950 text-slate-950"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.etiqueta}
            {typeof t.contador === "number" && t.contador > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  seleccionado ? "bg-slate-950 text-white" : "bg-rose-100 text-rose-700"
                }`}
              >
                {t.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
