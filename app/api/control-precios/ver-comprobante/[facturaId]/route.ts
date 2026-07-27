import { auth } from "@/auth";
import { db } from "@/db";
import { cpFacturas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { descargarDeR2, esClaveR2 } from "@/lib/control-precios/r2";
import { NextResponse } from "next/server";

// El store (Blob o R2, ver lib/control-precios/CLAUDE.md) es privado — un <img src>
// directo a archivo_url daría 403. Este endpoint autentica, resuelve el archivo real y
// hace de proxy del contenido para poder mostrarlo en el navegador.
export async function GET(request: Request, { params }: { params: Promise<{ facturaId: string }> }) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { facturaId } = await params;
  const id = Number(facturaId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Id de factura inválido." }, { status: 400 });
  }

  const [factura] = await db
    .select({ archivoUrl: cpFacturas.archivoUrl })
    .from(cpFacturas)
    .where(eq(cpFacturas.id, id))
    .limit(1);
  if (!factura?.archivoUrl) {
    return NextResponse.json({ error: "Esta factura no tiene comprobante adjunto." }, { status: 404 });
  }

  if (esClaveR2(factura.archivoUrl)) {
    try {
      const { buffer, contentType } = await descargarDeR2(factura.archivoUrl);
      return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
    } catch {
      return NextResponse.json({ error: "No se pudo descargar el comprobante." }, { status: 502 });
    }
  }

  // Legado: facturas cargadas antes de la migración a R2 siguen en Vercel Blob.
  const descargado = await get(factura.archivoUrl, { access: "private" });
  if (!descargado || descargado.statusCode !== 200) {
    return NextResponse.json({ error: "No se pudo descargar el comprobante." }, { status: 502 });
  }

  return new NextResponse(descargado.stream, {
    headers: { "Content-Type": descargado.blob.contentType || "application/octet-stream" },
  });
}
