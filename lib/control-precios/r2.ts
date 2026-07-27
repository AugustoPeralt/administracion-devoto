import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Storage de comprobantes de control-precios. Reemplaza a Vercel Blob para
 * subidas NUEVAS (el free tier de Blob es de 1GB, y a 2000 facturas/mes se
 * llena en semanas — ver lib/control-precios/CLAUDE.md). Las facturas viejas
 * siguen en Vercel Blob sin migrar; `esClaveR2()` es lo que distingue un
 * registro viejo (URL completa de Blob) de uno nuevo (clave de R2), sin
 * necesidad de una columna aparte en el schema.
 */
const cliente = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

/** Mismo allowlist que aceptaba el handleUpload de Vercel Blob — evita que
 * alguien con sesión válida suba un tipo de archivo arbitrario (ej. HTML/SVG)
 * al bucket. La extensión de la key sale de acá, no del nombre de archivo que
 * manda el cliente (ese es texto libre, no confiable para armar la key). */
const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};

/** Vercel Blob guarda una URL completa (https://...); una clave de R2 es un
 * path relativo sin protocolo — alcanza para distinguir sin tocar el schema. */
export function esClaveR2(referenciaArchivo: string): boolean {
  return !/^https?:\/\//i.test(referenciaArchivo);
}

/** Genera una URL firmada de subida directa (PUT) para que el navegador suba
 * el archivo sin pasar los bytes por una función serverless — mismo motivo que
 * el handleUpload de Vercel Blob que reemplaza. Expira en 5 minutos. */
export async function generarUrlSubida(contentType: string): Promise<{ url: string; key: string }> {
  const extension = TIPOS_PERMITIDOS[contentType];
  if (!extension) throw new Error(`Tipo de archivo no permitido: "${contentType}".`);
  const key = `facturas/${randomUUID()}${extension}`;
  const comando = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  const url = await getSignedUrl(cliente, comando, { expiresIn: 300 });
  return { url, key };
}

/** Descarga un comprobante de R2 (el bucket es privado, no hay URL pública). */
export async function descargarDeR2(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const resultado = await cliente.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resultado.Body) throw new Error(`No se pudo descargar "${key}" de R2.`);
  const buffer = Buffer.from(await resultado.Body.transformToByteArray());
  return { buffer, contentType: resultado.ContentType || "application/octet-stream" };
}
