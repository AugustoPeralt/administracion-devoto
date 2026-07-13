import { auth } from "@/auth";
import { obtenerAlertasMesActual, obtenerPosiblesDuplicados } from "@/lib/queries";
import { obtenerAlertasVigentes } from "@/lib/alquileres/consultas";
import { NavClient } from "./NavClient";

export async function Nav() {
  const session = await auth();

  let contadores: Record<string, number> = {};
  if (session?.user) {
    const [alertas, duplicados, alertasAlquileres] = await Promise.all([
      obtenerAlertasMesActual(),
      obtenerPosiblesDuplicados("pendientes"),
      obtenerAlertasVigentes(),
    ]);
    const alertasAlquileresGraves = alertasAlquileres.filter(
      (a) => a.prioridad === "critica" || a.prioridad === "urgente"
    );
    contadores = {
      "/consolidados/alertas": alertas.length,
      "/consolidados/duplicados": duplicados.length,
      "/alquileres/alertas": alertasAlquileresGraves.length,
    };
  }

  const usuario = session?.user ? { nombre: session.user.name ?? session.user.email ?? "" } : null;

  return <NavClient contadores={contadores} usuario={usuario} />;
}
