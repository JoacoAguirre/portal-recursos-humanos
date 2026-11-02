import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseMigrationNotice } from "@/components/admin/database-migration-notice";
import { EmployeeRegistrationReviewForm } from "@/components/registrations/employee-registration-review-form";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { Company, Profile } from "@/types/database";

export default async function EmployeeRegistrationsPage() {
  const user = await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_employees").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron consultar las empresas asignadas.");
  const companies = (companyData ?? []) as Company[];
  const manageableCompanies = user.role === "SUPERADMIN"
    ? companies
    : companies.filter((company) => accessRows?.some(
      (access) => access.company_id === company.id && access.can_manage_employees
    ));
  const visibleCompanies = user.role === "GERENTE"
    ? companies.filter((company) => accessRows?.some((access) => access.company_id === company.id))
    : manageableCompanies;
  if (!visibleCompanies.length && user.role !== "SUPERADMIN") {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-semibold">Registros pendientes</h1></div>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          No tenés permisos para administrar empleados en ninguna empresa asignada.
        </p>
      </div>
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    throw new Error("No se pudo conectar con la cola de registros.");
  }
  const { data: registrations, error: registrationError } = await admin
    .from("employee_registration_requests")
    .select("id, email, first_name, last_name, dni, company_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (registrationError) {
    if (isMissingTableError(registrationError)) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Registros pendientes</h1>
            <p className="mt-2 text-sm text-muted-foreground">Revisión de altas de empleados.</p>
          </div>
          <DatabaseMigrationNotice
            title="La cola de registros todavía no está disponible"
            description="La base de datos conectada aún no tiene la tabla de registros pendientes."
          />
        </div>
      );
    }
    console.error("employee_registrations_load_failed", registrationError.code ?? "unknown");
    throw new Error("No se pudieron cargar los registros pendientes. Revisá la conexión y los permisos de Supabase.");
  }

  const companyIds = visibleCompanies.map((company) => company.id);
  const { data: profileData, error: profilesError } = companyIds.length
    ? await supabase.from("profiles")
      .select("id, first_name, last_name, dni, employee_number, company_id, hire_date")
      .in("company_id", companyIds)
      .order("last_name")
      .limit(2000)
    : { data: [], error: null };
  if (profilesError) throw new Error("No se pudieron consultar legajos para vincular.");
  const profiles = (profileData ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "dni" | "employee_number" | "company_id" | "hire_date">[];
  const visibleDnis = new Set(profiles.flatMap((profile) => profile.dni ? [profile.dni] : []));
  const visibleRegistrations = user.role === "GERENTE"
    ? (registrations ?? []).filter((registration) => visibleDnis.has(registration.dni))
    : registrations ?? [];
  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Registros pendientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisá los datos y vinculá cada cuenta con un legajo existente por DNI o creá uno nuevo. La cuenta no puede ingresar antes de la aprobación.
        </p>
      </div>
      {!visibleRegistrations.length ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No hay registros pendientes.</CardContent></Card>
      ) : visibleRegistrations.map((registration) => {
        const matchingProfiles = profiles
          .filter((profile) => profile.dni === registration.dni && profile.company_id)
          .flatMap((profile) => {
            const companyName = profile.company_id ? companyNameById.get(profile.company_id) : null;
            return companyName ? [{
              ...profile,
              full_name: `${profile.first_name} ${profile.last_name}`,
              company_name: companyName
            }] : [];
          });
        return (
          <Card key={registration.id}>
            <CardHeader>
              <CardTitle className="text-base">{registration.last_name}, {registration.first_name}</CardTitle>
              <p className="text-sm text-muted-foreground">{registration.email} · DNI {registration.dni}</p>
              <p className="text-sm text-muted-foreground">Empresa solicitada: {registration.company_id ? companyNameById.get(registration.company_id) ?? "No disponible" : "Sin especificar"}</p>
              <p className="text-xs text-muted-foreground">Solicitado {formatDateTime(registration.created_at)}</p>
            </CardHeader>
            <CardContent>
              {user.role === "GERENTE"
                ? <p className="text-sm text-muted-foreground">Acceso de solo lectura. La revisión de registros está reservada a RR. HH.</p>
                : <EmployeeRegistrationReviewForm
                    registration={registration}
                    companies={manageableCompanies}
                    matchingProfiles={matchingProfiles}
                  />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
