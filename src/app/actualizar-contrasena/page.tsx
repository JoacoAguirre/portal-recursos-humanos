import type { Metadata } from "next";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";

export const metadata: Metadata = { title: "Crear contraseña nueva" };

export default function UpdatePasswordPage() {
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><div className="w-full max-w-md"><h1 className="text-2xl font-semibold">Crear contraseña nueva</h1><p className="mt-2 text-sm text-muted-foreground">Elegí una contraseña segura para volver a ingresar.</p><PasswordUpdateForm /></div></main>;
}
