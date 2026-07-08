import Link from "next/link";
import { obtenerAlertasMesActual } from "@/lib/queries";
import { Badge } from "@/components/Badge";

export default async function AlertasPage() {
  const alertas = await obtenerAlertasMesActual();

  const porCaja = new Map<string, typeof alertas>();
  for (const a of alertas) {
    const lista = porCaja.get(a.cajaNombre) ?? [];
    lista.push(a);
    porCaja.set(a.cajaNombre, lista);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Alertas de pagos pendientes</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Pagos recurrentes (alquileres, sueldos, sistemas, etc.) que todavía no aparecen cargados este mes en
            su caja. Puede ser que falte pagarlo o que se haya olvidado cargar — cualquiera de las dos cosas hay
            que revisarla.
          </p>
        </div>
        <Link
          href="/alertas/reglas"
          className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          Configurar reglas
        </Link>
      </div>

      {alertas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          No hay alertas: todos los pagos recurrentes configurados ya aparecen cargados este mes.
        </p>
      ) : (
        <div className="space-y-4">
          {[...porCaja.entries()].map(([cajaNombre, items]) => (
            <div key={cajaNombre} className="rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Link href={`/cajas/${items[0].cajaId}`} className="font-semibold text-slate-950 hover:underline">
                  {cajaNombre}
                </Link>
                <Badge color="rojo">{items.length} sin cargar</Badge>
              </div>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id} className="text-sm text-slate-700">
                    {item.nombre}{" "}
                    <span className="font-mono text-xs text-slate-400">
                      ({item.codTitular !== null ? `cód. titular ${item.codTitular}` : `cód. cuenta ${item.codCuenta}`})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
