import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const emailsPermitidos = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Encargados de restaurantes: solo cargan facturas en Control de Precios, sin
// acceso a Consolidados (tesorería) ni a nada más. Deben estar TAMBIÉN en
// ALLOWED_EMAILS (esta lista no reemplaza el chequeo de login, solo acota qué
// pueden ver una vez adentro) — el bloqueo real de rutas pasa en middleware.ts.
const emailsSoloControlPrecios = (process.env.EMAILS_SOLO_CONTROL_PRECIOS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function esEmailRestringidoAControlPrecios(email: string | null | undefined): boolean {
  return !!email && emailsSoloControlPrecios.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      // Sin esto, después de cerrar sesión en nuestra app Microsoft te vuelve a
      // loguear en silencio por SSO (sin preguntar) porque el navegador todavía
      // tiene una sesión activa en login.microsoftonline.com. Forzamos que
      // siempre muestre el selector de cuenta. Repetimos el scope por defecto del
      // proveedor acá porque este objeto REEMPLAZA el suyo entero, no se combina.
      authorization: { params: { prompt: "select_account", scope: "openid profile email User.Read" } },
      // Muchas cuentas organizacionales no tienen el atributo "mail" cargado en
      // Entra ID, así que el claim "email" del token puede venir vacío aunque el
      // login funcione. "preferred_username" (el UPN, lo que se usa para loguearse)
      // sí está siempre presente y es el mismo valor que se espera en ALLOWED_EMAILS.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email ?? profile.preferred_username ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Solo vos y tu jefa (o quien se agregue a ALLOWED_EMAILS) pueden entrar.
      if (emailsPermitidos.length === 0) return true;
      return !!user.email && emailsPermitidos.includes(user.email.toLowerCase());
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
