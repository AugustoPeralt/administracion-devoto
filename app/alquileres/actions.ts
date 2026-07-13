"use server";

import { revalidatePath } from "next/cache";
import { sincronizarAlquileres as sincronizar } from "@/lib/alquileres/sincronizar-sharepoint";

export async function sincronizarAlquileres() {
  await sincronizar();
  revalidatePath("/alquileres", "layout");
}
