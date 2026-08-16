/** Icono "i" con tooltip flotante en hover/focus — para mover explicaciones
 * largas fuera del flujo principal de la pantalla sin perder el contexto para
 * quien lo necesite. Puramente CSS (group-hover/group-focus-within), sin
 * estado ni JS, así que no hace falta "use client". */
export function InfoTooltip({ texto }: { texto: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <span
        tabIndex={0}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-400 outline-none hover:border-slate-400 hover:text-slate-600 focus-visible:border-slate-400 focus-visible:text-slate-600"
        aria-label="Más información"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {texto}
      </span>
    </span>
  );
}
