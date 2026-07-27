"use client";

import { useRef } from "react";
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
  "control-precios": {
    label: "Control de Precios",
    items: [
      { href: "/control-precios/carga", label: "Cargar comprobante" },
      { href: "/control-precios/comparacion", label: "Comparar proveedores" },
      { href: "/control-precios/reportes", label: "Reporte de precios" },
      { href: "/control-precios/proveedores", label: "Calidad de datos" },
      { href: "/control-precios/verduleria", label: "Precios verdulería" },
    ],
  },
};

/** "Franco Oliva" → "FO"; un solo nombre → sus dos primeras letras. */
function iniciales(nombreOEmail: string): string {
  const base = nombreOEmail.includes("@") ? nombreOEmail.split("@")[0] : nombreOEmail;
  const partes = base.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function NavClient({
  contadores,
  usuario,
}: {
  contadores: Record<string, number>;
  usuario: { nombre: string } | null;
}) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const userMenuRef = useRef<HTMLDetailsElement>(null);

  const claveModulo = Object.keys(MODULOS).find(
    (k) => pathname === `/${k}` || pathname.startsWith(`/${k}/`)
  );
  const modulo = claveModulo ? MODULOS[claveModulo] : null;
  const totalAlertas = modulo
    ? modulo.items.reduce((acc, i) => acc + (contadores[i.href] ?? 0), 0)
    : 0;

  const cerrarMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-slate-950 hover:text-slate-700">
          AdministracionDevoto
        </Link>
        {modulo && (
          <>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-500">{modulo.label}</span>
          </>
        )}

        <div className="flex-1" />

        {modulo && (
          <details ref={menuRef} className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true">☰</span>
              <span>Menú</span>
              {totalAlertas > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                  {totalAlertas}
                </span>
              )}
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
              {modulo.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={cerrarMenu}
                  className={`flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-50 ${
                    pathname === item.href ? "font-medium text-slate-950" : "text-slate-600"
                  }`}
                >
                  <span>{item.label}</span>
                  {contadores[item.href] > 0 && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                      {contadores[item.href]}
                    </span>
                  )}
                </Link>
              ))}
              <div className="my-1.5 border-t border-slate-100" />
              <Link
                href="/"
                onClick={cerrarMenu}
                className="block px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                ← Selector de módulos
              </Link>
            </div>
          </details>
        )}

        {usuario && (
          <details ref={userMenuRef} className="relative">
            <summary
              title={usuario.nombre}
              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white [&::-webkit-details-marker]:hidden"
            >
              {iniciales(usuario.nombre)}
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <p className="truncate text-sm text-slate-700">{usuario.nombre}</p>
              <form action={cerrarSesion} className="mt-2">
                <button type="submit" className="text-sm text-slate-400 transition-colors hover:text-slate-700">
                  Cerrar sesión
                </button>
              </form>
            </div>
          </details>
        )}
      </div>
    </nav>
  );
}
