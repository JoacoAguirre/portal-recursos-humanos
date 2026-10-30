import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InviteEmployeeForm } from "@/components/employees/invite-employee-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { Company } from "@/types/database";

export default async function NewEmployeePage() {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_employees").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron cargar las empresas.");
  const allCompanies = (companyData ?? []) as Company[];
  const manageable = user.role === "SUPERADMIN"
    ? allCompanies
    : allCompanies.filter((company) => accessRows?.some((access) => access.company_id === company.id && access.can_manage_employees));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/empleados"><ArrowLeft className="h-4 w-4" />Volver a empleados</Link></Button>
      <div><h1 className="text-2xl font-semibold">Invitar empleado</h1><p className="mt-2 text-sm text-muted-foreground">Se enviará un correo de invitación desde Supabase Auth y se creará el legajo.</p></div>
      <Card><CardHeader><CardTitle>Datos del legajo</CardTitle></CardHeader><CardContent>
        {!manageable.length ? <p className="text-sm text-amber-300">No tenés permiso de administración de empleados en ninguna empresa asignada.</p> : <InviteEmployeeForm companies={manageable} />}
      </CardContent></Card>
    </div>
  );
}
