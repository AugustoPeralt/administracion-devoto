import { auth } from "@/auth";
import { generarUrlSubida } from "@/lib/control-precios/r2";
import { NextResponse } from "next/server";

// Reemplaza a blob-upload/route.ts para subidas nuevas (ver lib/control-precios/CLAUDE.md).
// Mismo motivo que el endpoint que reemplaza: el navegador sube directo a R2 con esta
// URL firmada, sin pasar los bytes del archivo por esta función.
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { contentType } = (await request.json()) as { contentType?: string };
  if (!contentType) {
    return NextResponse.json({ error: "Falta contentType." }, { status: 400 });
  }

  try {
    const { url, key } = await generarUrlSubida(contentType);
    return NextResponse.json({ url, key });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al generar la URL de subida." },
      { status: 400 }
    );
  }
}
