"use server";

import { signIn, signOut } from "@/auth";

export async function iniciarSesionMicrosoft() {
  await signIn("microsoft-entra-id");
}

export async function cerrarSesion() {
  // redirectTo explícito para evitar el doble salto signOut()->"/"->middleware->"/login",
  // que parece corromper la referencia a la server action en la página final.
  await signOut({ redirectTo: "/login" });
}
