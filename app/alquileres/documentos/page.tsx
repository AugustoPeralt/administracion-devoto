import { obtenerDocumentos } from "@/lib/alquileres/consultas";

export default async function DocumentosPage() {
  const documentos = await obtenerDocumentos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Documentos</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Vista de la carpeta de solo lectura con los contratos reales en SharePoint. Todavía no está activa —
          falta confirmar la ruta exacta una vez que se tenga acceso a esa parte del SharePoint.
        </p>
      </div>

      {documentos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-400">
          Sin documentos todavía. Esta pantalla se completa cuando se confirme la ruta de SharePoint (ver
          lib/alquileres/sincronizar-sharepoint.ts).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-800">{d.nombre}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <a
                      href={d.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
                    >
                      Abrir en SharePoint ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
