import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const emailsPermitidos = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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
