import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VacancyManager } from "@/components/applications/vacancy-manager";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function VacanciesPage() {
  await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: vacancies, error: vacancyError }, { data: companies, error: companyError }] = await Promise.all([
    supabase.from("job_vacancies").select("*").order("title"),
    admin.from("companies").select("id, name, active").order("name")
  ]);
  if (vacancyError || companyError) throw new Error("No se pudieron cargar las vacantes.");
  const companyNames = new Map((companies ?? []).map((company) => [company.id, company.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vacantes laborales</h1>
        <p className="mt-2 text-sm text-muted-foreground">Creá y administrá las vacantes disponibles en el formulario público de postulación.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Nueva vacante</CardTitle></CardHeader>
        <CardContent>
          <VacancyManager
            companies={companies ?? []}
            vacancies={(vacancies ?? []).map((vacancy) => ({
              ...vacancy,
              companyName: companyNames.get(vacancy.company_id) ?? "Empresa"
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
