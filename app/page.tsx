import Link from "next/link";

interface Modulo {
  href: string;
  nombre: string;
  descripcion: string;
  disponible: boolean;
}

const MODULOS: Modulo[] = [
  {
    href: "/consolidados",
    nombre: "Consolidados",
    descripcion: "Auditoría de tesorería: cajas, movimientos, duplicados y alertas de pagos recurrentes.",
    disponible: true,
  },
  {
    href: "/control-precios/carga",
    nombre: "Control de Precios",
    descripcion: "Carga de facturas de proveedores con IA y auditoría de aumentos por rubro.",
    disponible: true,
  },
];

export default function SelectorModulosPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">AdministracionDevoto</h1>
        <p className="mt-1 text-sm text-slate-500">Elegí en qué módulo querés trabajar.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MODULOS.map((modulo) =>
          modulo.disponible ? (
            <Link
              key={modulo.href}
              href={modulo.href}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-slate-950">{modulo.nombre}</h2>
              <p className="mt-1.5 text-sm text-slate-500">{modulo.descripcion}</p>
            </Link>
          ) : (
            <div
              key={modulo.href}
              className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 opacity-70"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-700">{modulo.nombre}</h2>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Próximamente
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-400">{modulo.descripcion}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
