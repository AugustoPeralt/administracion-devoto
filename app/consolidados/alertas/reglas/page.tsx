import Link from "next/link";
import { obtenerConceptosEsperados, obtenerTodasLasCajas } from "@/lib/queries";
import { Badge } from "@/components/Badge";
import {
  crearConceptoEsperado,
  alternarActivoConcepto,
  eliminarConceptoEsperado,
  editarPalabrasClaveConcepto,
} from "../actions";

export default async function ReglasAlertasPage() {
  const [conceptos, cajas] = await Promise.all([obtenerConceptosEsperados(), obtenerTodasLasCajas()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/consolidados/alertas" className="text-sm text-slate-500 hover:text-slate-900">
          ← Volver a Alertas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Configurar pagos recurrentes esperados
        </h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Por cada caja, definí qué código de titular o de cuenta identifica un pago que se espera todos los
          meses (ej. alquiler, sueldos). El sistema compara ese código contra los movimientos cargados en el mes
          actual — si no aparece ninguno con ese código, avisa en <Link href="/consolidados/alertas" className="underline">Alertas</Link>.
        </p>
        <p className="max-w-3xl text-sm text-slate-500">
          Las <strong>palabras clave</strong> son un chequeo de respaldo opcional (separadas por coma) para cuando
          se carga el pago sin el código y directamente como concepto libre (ej. &quot;OFICINA DE SEIS&quot;
          suelto, sin cód. titular). Antes de avisar, además del código se busca ese texto en la descripción o el
          concepto manual del movimiento. Un prefijo &quot;=&quot; exige coincidencia exacta en vez de substring.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Nueva regla</h2>
        <form action={crearConceptoEsperado} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Caja</label>
            <select
              name="cajaId"
              required
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            >
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Nombre del concepto</label>
            <input
              type="text"
              name="nombre"
              required
              placeholder="Ej. Alquiler local"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Tipo de código</label>
            <select
              name="tipoCodigo"
              required
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            >
              <option value="titular">Titular</option>
              <option value="cuenta">Cuenta (solo obra)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Código</label>
            <input
              type="number"
              name="codigo"
              required
              placeholder="Ej. 3"
              className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Palabras clave (opcional)</label>
            <input
              type="text"
              name="palabrasClave"
              placeholder="Ej. OFICINA DE SEIS — chequeo de respaldo por texto"
              className="min-w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Caja</th>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Palabras clave (respaldo)</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {conceptos.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{c.cajaNombre}</td>
                <td className="px-3 py-2 text-slate-800">{c.nombre}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {c.codTitular !== null ? `titular ${c.codTitular}` : `cuenta ${c.codCuenta}`}
                </td>
                <td className="px-3 py-2">
                  <form action={editarPalabrasClaveConcepto} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      type="text"
                      name="palabrasClave"
                      defaultValue={c.palabrasClave ?? ""}
                      placeholder="Sin configurar"
                      className="min-w-48 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-950"
                    />
                    <button type="submit" className="whitespace-nowrap text-xs text-slate-500 hover:text-slate-900">
                      Guardar
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  {c.activo ? <Badge color="verde">Activa</Badge> : <Badge>Desactivada</Badge>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <form action={alternarActivoConcepto} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="activo" value={String(c.activo)} />
                    <button type="submit" className="mr-3 text-xs text-slate-500 hover:text-slate-900">
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                  <form action={eliminarConceptoEsperado} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-rose-500 hover:text-rose-700">
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {conceptos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  Todavía no hay reglas configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
