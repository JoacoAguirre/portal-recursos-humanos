import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-400" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Acceso no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu cuenta no tiene un perfil activo o no cuenta con permisos para esta sección.
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">Volver al inicio de sesión</Link>
        </Button>
      </div>
    </main>
  );
}
