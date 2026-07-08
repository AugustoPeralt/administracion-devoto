import { graphFetch } from "./graph";

function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre} en .env.local (ver .env.example).`);
  }
  return valor;
}

/** Normaliza a ruta que empieza con "/" (Graph API lo requiere en los endpoints "root:{ruta}:"). */
function normalizarRuta(ruta: string): string {
  return ruta.startsWith("/") ? ruta : `/${ruta}`;
}

/** Resuelve el id interno del sitio de SharePoint a partir de SHAREPOINT_HOSTNAME + SHAREPOINT_SITE_PATH. */
export async function obtenerSiteId(): Promise<string> {
  const hostname = requerirEnv("SHAREPOINT_HOSTNAME");
  const sitePath = requerirEnv("SHAREPOINT_SITE_PATH");
  const resp = await graphFetch(`/sites/${hostname}:${normalizarRuta(sitePath)}`);
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/** Id de la biblioteca de documentos por defecto del sitio. */
export async function obtenerDriveIdPrincipal(siteId: string): Promise<string> {
  const resp = await graphFetch(`/sites/${siteId}/drive`);
  const data = (await resp.json()) as { id: string };
  return data.id;
}

export interface ArchivoDrive {
  nombre: string;
  esCarpeta: boolean;
  tamanoBytes: number;
  modificado: string;
}

/**
 * Lista el contenido de una carpeta del drive. Pensado como herramienta de
 * diagnóstico (`scripts/sync-sharepoint.ts --listar`) para confirmar la ruta
 * exacta de los archivos antes de fijarla en las variables de entorno.
 */
export async function listarCarpeta(driveId: string, folderPath: string): Promise<ArchivoDrive[]> {
  const resp = await graphFetch(`/drives/${driveId}/root:${normalizarRuta(folderPath)}:/children`);
  const data = (await resp.json()) as { value: Record<string, unknown>[] };
  return data.value.map((item) => ({
    nombre: String(item.name),
    esCarpeta: !!item.folder,
    tamanoBytes: Number(item.size ?? 0),
    modificado: String(item.lastModifiedDateTime ?? ""),
  }));
}

export interface ArchivoDescargado {
  buffer: Buffer;
  itemId: string;
}

/** Descarga el contenido binario de un archivo del drive dado su path relativo. */
export async function descargarArchivo(driveId: string, itemPath: string): Promise<ArchivoDescargado> {
  const ruta = normalizarRuta(itemPath);

  const metaResp = await graphFetch(`/drives/${driveId}/root:${ruta}`);
  const meta = (await metaResp.json()) as { id: string };

  const contenidoResp = await graphFetch(`/drives/${driveId}/items/${meta.id}/content`);
  const arrayBuffer = await contenidoResp.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), itemId: meta.id };
}

export interface VersionArchivo {
  id: string;
  fecha: Date;
  modificadoPor: string | null;
}

/** Historial de versiones de un archivo, más reciente primero (según lo devuelve Graph API). */
export async function obtenerVersiones(driveId: string, itemId: string): Promise<VersionArchivo[]> {
  const resp = await graphFetch(`/drives/${driveId}/items/${itemId}/versions`);
  const data = (await resp.json()) as { value: Record<string, any>[] };
  return data.value.map((v) => ({
    id: String(v.id),
    fecha: new Date(v.lastModifiedDateTime),
    modificadoPor: v.lastModifiedBy?.user?.displayName ?? v.lastModifiedBy?.user?.email ?? null,
  }));
}
