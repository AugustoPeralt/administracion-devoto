import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { iniciarSesionMicrosoft } from "@/lib/auth-actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-slate-950">AdministracionDevoto</h1>
      <p className="mb-6 text-sm text-slate-500">Acceso restringido. Iniciá sesión con tu cuenta Microsoft.</p>
      <form action={iniciarSesionMicrosoft}>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800"
        >
          Iniciar sesión con Microsoft
        </button>
      </form>
    </div>
  );
}
