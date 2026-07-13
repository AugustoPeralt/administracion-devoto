"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/auth-actions";

interface ItemNav {
  href: string;
  label: string;
}

interface ModuloNav {
  label: string;
  items: ItemNav[];
}

const MODULOS: Record<string, ModuloNav> = {
  consolidados: {
    label: "Consolidados",
    items: [
      { href: "/consolidados", label: "Dashboard" },
      { href: "/consolidados/auditoria", label: "Auditoría" },
      { href: "/consolidados/duplicados", label: "Duplicados" },
      { href: "/consolidados/alertas", label: "Alertas" },
      { href: "/consolidados/anomalias", label: "Anomalías" },
      { href: "/consolidados/errores-excel", label: "Errores de Excel" },
    ],
  },
  alquileres: {
    label: "Alquileres",
    items: [],
  },
};

export function NavClient({
  contadores,
  usuario,
}: {
  contadores: Record<string, number>;
  usuario: { nombre: string } | null;
}) {
  const pathname = usePathname();
  const claveModulo = Object.keys(MODULOS).find(
    (k) => pathname === `/${k}` || pathname.startsWith(`/${k}/`)
  );
  const modulo = claveModulo ? MODULOS[claveModulo] : null;

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-slate-950 hover:text-slate-700">
          AdministracionDevoto
        </Link>
        {modulo && (
          <>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-500">{modulo.label}</span>
          </>
        )}

        <div className="flex flex-1 gap-4 text-sm">
          {modulo?.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 transition-colors hover:text-slate-950 ${
                pathname === item.href ? "font-medium text-slate-950" : "text-slate-600"
              }`}
            >
              {item.label}
              {contadores[item.href] > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                  {contadores[item.href]}
                </span>
              )}
            </Link>
          ))}
        </div>

        {modulo && (
          <Link href="/" className="whitespace-nowrap text-sm text-slate-400 hover:text-slate-700">
            ← Selector de módulos
          </Link>
        )}

        {usuario && (
          <form action={cerrarSesion} className="flex items-center gap-2 text-sm text-slate-500">
            <span>{usuario.nombre}</span>
            <button type="submit" className="text-slate-400 hover:text-slate-700">
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
