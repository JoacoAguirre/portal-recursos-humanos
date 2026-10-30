import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-blue-950 via-slate-950 to-slate-900 p-12 lg:flex">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="rounded-lg bg-blue-500/20 p-2 text-blue-300">RR. HH.</span>
          Portal de Recursos Humanos
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-blue-300">Gestión segura y centralizada</p>
          <h1 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
            Todo lo que necesitás para gestionar tu vida laboral.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
            Accedé a tus solicitudes, documentos y novedades desde un único lugar.
          </p>
        </div>
        <p className="text-xs text-slate-500">Acceso privado para colaboradores y equipos de Recursos Humanos.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <p className="text-sm font-semibold text-blue-300">Portal de Recursos Humanos</p>
          </div>
          <h2 className="text-2xl font-semibold">Iniciá sesión</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ingresá con tu cuenta corporativa.</p>
          <LoginForm />
          <p className="mt-8 text-center text-xs leading-5 text-slate-500">
            ¿Necesitás ayuda? Contactá al equipo de Recursos Humanos de tu empresa.
          </p>
        </div>
      </section>
    </main>
  );
}
