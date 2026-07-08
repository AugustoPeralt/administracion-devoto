/**
 * Cliente app-only (client credentials) de Microsoft Graph. Reusa el mismo
 * App Registration de Azure AD que se creó para el login (AUTH_MICROSOFT_ENTRA_ID_*),
 * pero con un flujo de autenticación distinto: acá no hay un usuario logueado
 * (es la sincronización automática de Fase 4), así que se pide un token a nombre
 * de la aplicación misma. Requiere que ese App Registration tenga permisos de
 * *aplicación* (no delegados) del tipo Sites.Read.All o Files.Read.All, con
 * consentimiento de administrador otorgado en Azure AD.
 */

interface TokenCache {
  token: string;
  expiraEn: number;
}

let cache: TokenCache | null = null;

function extraerTenantId(): string {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  const match = issuer.match(/login\.microsoftonline\.com\/([^/]+)/);
  if (!match) {
    throw new Error(
      "No se pudo extraer el tenant id de AUTH_MICROSOFT_ENTRA_ID_ISSUER. Verificá que tenga el formato " +
        "https://login.microsoftonline.com/<TENANT_ID>/v2.0"
    );
  }
  return match[1];
}

export async function obtenerTokenGraph(): Promise<string> {
  if (cache && cache.expiraEn > Date.now() + 60_000) return cache.token;

  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan AUTH_MICROSOFT_ENTRA_ID_ID / AUTH_MICROSOFT_ENTRA_ID_SECRET en .env.local (mismas credenciales del login)."
    );
  }
  const tenantId = extraerTenantId();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(
      `No se pudo obtener token app-only de Microsoft Graph (${resp.status}): ${texto}\n` +
        `Revisá que el App Registration tenga permisos de aplicación (Sites.Read.All o Files.Read.All) ` +
        `con consentimiento de administrador otorgado.`
    );
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cache = { token: data.access_token, expiraEn: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

/** Llama a un endpoint de Microsoft Graph v1.0 con el token app-only ya resuelto. */
export async function graphFetch(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const token = await obtenerTokenGraph();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
  const resp = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Graph API respondió ${resp.status} en ${url}: ${texto}`);
  }
  return resp;
}
