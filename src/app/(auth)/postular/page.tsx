import type { Metadata } from "next";
import Link from "next/link";
import { ApplicantForm } from "@/components/applications/applicant-form";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Postularme" };
export const dynamic = "force-dynamic";

export default async function ApplicantPage() {
  const admin = createAdminClient();
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) throw new Error("No se pudieron cargar las empresas disponibles para postularse.");

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold text-blue-300">Portal de Recursos Humanos</p>
        <h1 className="mt-3 text-2xl font-semibold">Postulación laboral</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elegí una empresa y una vacante, o envianos una postulación espontánea.
        </p>
        <ApplicantForm companies={companies ?? []} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya trabajás con nosotros?{" "}
          <Link href="/login" className="font-medium text-blue-300 transition hover:text-blue-200">
            Iniciá sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
