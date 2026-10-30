import type { Metadata } from "next";
import { RegistrationForm } from "@/components/auth/registration-form";

export const metadata: Metadata = { title: "Completar alta" };

export default function RegistrationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold text-blue-300">Portal de Recursos Humanos</p>
        <h1 className="mt-3 text-2xl font-semibold">Completá tu alta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirmá tus datos personales y elegí una contraseña segura. Los datos laborales y permisos los administra RR. HH.
        </p>
        <RegistrationForm />
      </div>
    </main>
  );
}
