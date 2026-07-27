import { auth } from "@/auth";

// Alquileres no está listo (funciona mal) — deshabilitado a nivel de ruta, no
// solo oculto del menú (NavClient.tsx / app/page.tsx): sacar el link del nav no
// alcanza, cualquiera con sesión válida podría entrar igual escribiendo la URL
// directo. Bloquea también las server actions del módulo, que se invocan por
// POST a estas mismas rutas.
const RUTAS_DESHABILITADAS = ["/alquileres"];

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return Response.redirect(loginUrl);
  }

  const { pathname } = req.nextUrl;
  if (RUTAS_DESHABILITADAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
