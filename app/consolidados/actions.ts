"use server";

import { revalidatePath } from "next/cache";
import { sincronizarDesdeSharePoint } from "@/lib/sincronizar-sharepoint";

export async function actualizarDesdeSharePoint() {
  await sincronizarDesdeSharePoint();
  revalidatePath("/consolidados", "layout");
}
