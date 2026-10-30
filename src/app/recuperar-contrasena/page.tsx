import type { Metadata } from "next";
import Link from "next/link";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function PasswordResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Te enviaremos las instrucciones al correo asociado a tu cuenta.
        </p>
        <PasswordResetForm />
        <Link href="/login" className="mt-6 inline-block text-sm text-blue-400 hover:text-blue-300">Volver al inicio de sesión</Link>
      </div>
    </main>
  );
}
