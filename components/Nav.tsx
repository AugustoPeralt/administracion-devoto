import Link from "next/link";
import { auth } from "@/auth";
import { cerrarSesion } from "@/lib/auth-actions";
import { obtenerAlertasMesActual, obtenerPosiblesDuplicados } from "@/lib/queries";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/auditoria", label: "Auditoría" },
  { href: "/duplicados", label: "Duplicados" },
  { href: "/alertas", label: "Alertas" },
  { href: "/anomalias", label: "Anomalías" },
  { href: "/errores-excel", label: "Errores de Excel" },
];

export async function Nav() {
  const session = await auth();

  let contadores: Record<string, number> = {};
  if (session?.user) {
    const [alertas, duplicados] = await Promise.all([
      obtenerAlertasMesActual(),
      obtenerPosiblesDuplicados("pendientes"),
    ]);
    contadores = { "/alertas": alertas.length, "/duplicados": duplicados.length };
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-semibold tracking-tight text-slate-950">Auditoría Consolidados</span>
        <div className="flex flex-1 gap-4 text-sm">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 text-slate-600 transition-colors hover:text-slate-950"
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
        {session?.user && (
          <form action={cerrarSesion} className="flex items-center gap-2 text-sm text-slate-500">
            <span>{session.user.name ?? session.user.email}</span>
            <button type="submit" className="text-slate-400 hover:text-slate-700">
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
