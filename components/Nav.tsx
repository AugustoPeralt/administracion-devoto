import { auth } from "@/auth";
import { obtenerAlertasMesActual, obtenerPosiblesDuplicados } from "@/lib/queries";
import { NavClient } from "./NavClient";

export async function Nav() {
  const session = await auth();

  let contadores: Record<string, number> = {};
  if (session?.user) {
    const [alertas, duplicados] = await Promise.all([
      obtenerAlertasMesActual(),
      obtenerPosiblesDuplicados("pendientes"),
    ]);
    contadores = {
      "/consolidados/alertas": alertas.length,
      "/consolidados/duplicados": duplicados.length,
    };
  }

  const usuario = session?.user ? { nombre: session.user.name ?? session.user.email ?? "" } : null;

  return <NavClient contadores={contadores} usuario={usuario} />;
}
