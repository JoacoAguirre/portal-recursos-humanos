import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyAccessForm } from "@/components/admin/company-access-form";
import { CompanySettingsForm } from "@/components/admin/company-settings-form";
import { EppCatalogForm } from "@/components/admin/epp-catalog-form";
import { EppDeactivateButton } from "@/components/admin/epp-deactivate-button";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { ResendUserSetupButton } from "@/components/admin/resend-user-setup-button";
import { RoleAssignmentForm } from "@/components/admin/role-assignment-form";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { Company } from "@/types/database";

type ManagedUser = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "EMPLEADO" | "RRHH_ADMIN" | "SUPERADMIN";
};

export default async function AdminConfigurationPage() {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: catalog, error: catalogError }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("epp_catalog").select("id, company_id, name, description").eq("active", true).order("name")
  ]);
  if (companiesError || catalogError) throw new Error("No se pudo cargar la configuración.");
  const companies = (companyData ?? []) as Company[];

  let managedUsers: ManagedUser[] = [];
  let assignments: { user_id: string; company_id: string; can_manage_employees: boolean; can_manage_documents: boolean; can_resolve_requests: boolean }[] = [];
  if (user.role === "SUPERADMIN") {
    const [{ data: users, error: usersError }, { data: access, error: accessError }] = await Promise.all([
      supabase.rpc("list_managed_users"),
      supabase.from("user_company_access").select("*")
    ]);
    if (usersError || accessError) {
      console.error("admin_configuration_users_load_failed", {
        usersCode: usersError?.code ?? "none",
        accessCode: accessError?.code ?? "none"
      });
      throw new Error("No se pudo cargar la administración de usuarios.");
    }
    managedUsers = (users ?? []) as ManagedUser[];
    assignments = access ?? [];
  }
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));

  return (
    <div className="space-y-7">
      <div><h1 className="text-2xl font-semibold">Configuración</h1><p className="mt-2 text-sm text-muted-foreground">Catálogos y permisos disponibles según tu nivel de acceso.</p></div>
      <Card><CardHeader><CardTitle>Catálogo de ropa y EPP</CardTitle><p className="text-sm text-muted-foreground">Los elementos activos están disponibles en los formularios de solicitud.</p></CardHeader><CardContent className="space-y-5">
        <EppCatalogForm companies={companies} superadmin={user.role === "SUPERADMIN"} />
        {!catalog?.length ? <p className="text-sm text-muted-foreground">No hay elementos en el catálogo.</p> : <div className="divide-y divide-slate-700">{catalog.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.company_id ? companyNames.get(item.company_id) ?? "Empresa" : "Catálogo global"}{item.description ? ` · ${item.description}` : ""}</p></div><EppDeactivateButton id={item.id} /></div>)}</div>}
      </CardContent></Card>

      {user.role === "SUPERADMIN" && (
        <>
          <Card><CardHeader><CardTitle>Empresas</CardTitle><p className="text-sm text-muted-foreground">Los cambios de nombre y estado quedan limitados a SUPERADMIN.</p></CardHeader><CardContent className="space-y-5">
            {companies.map((company) => <div key={company.id} className="border-b border-slate-700 pb-5 last:border-0 last:pb-0"><CompanySettingsForm company={company} /></div>)}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Invitar administrador de RR. HH.</CardTitle><p className="text-sm text-muted-foreground">Se crea un usuario sin acceso público y se asignan permisos explícitos por empresa.</p></CardHeader><CardContent><InviteAdminForm companies={companies.filter((company) => company.active)} /></CardContent></Card>

          <Card><CardHeader><CardTitle>Usuarios y roles</CardTitle><p className="text-sm text-muted-foreground">Las asignaciones no pueden elevar privilegios desde el navegador del usuario final.</p></CardHeader><CardContent className="space-y-4">
            {!managedUsers.length ? <p className="text-sm text-muted-foreground">No hay usuarios provisionados.</p> : managedUsers.map((managedUser) => {
              const isHrAdmin = managedUser.role === "RRHH_ADMIN";
              const userAssignments = assignments.filter((assignment) => assignment.user_id === managedUser.user_id);
              return <div key={managedUser.user_id} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{managedUser.first_name} {managedUser.last_name}</p><p className="mt-1 text-xs text-muted-foreground">{managedUser.email}</p></div><div className="flex items-center gap-3"><Badge tone={managedUser.role === "SUPERADMIN" ? "warning" : managedUser.role === "RRHH_ADMIN" ? "default" : "muted"}>{managedUser.role}</Badge>{managedUser.user_id !== user.id && <ResendUserSetupButton userId={managedUser.user_id} email={managedUser.email} />}</div></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  {managedUser.user_id !== user.id && <RoleAssignmentForm id={managedUser.user_id} role={managedUser.role} />}
                  {isHrAdmin && <div className="w-full border-t border-slate-700 pt-4"><CompanyAccessForm userId={managedUser.user_id} companies={companies.filter((company) => company.active)} assigned={userAssignments} /></div>}
                </div>
              </div>;
            })}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
