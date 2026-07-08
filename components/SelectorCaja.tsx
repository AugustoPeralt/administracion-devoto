"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function SelectorCaja({
  cajas,
}: {
  cajas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      defaultValue={searchParams.get("caja") ?? ""}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set("caja", e.target.value);
        else params.delete("caja");
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 outline-none focus:border-slate-950"
    >
      <option value="">Todas las cajas</option>
      {cajas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}
