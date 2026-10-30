import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditEmployeeForm } from "@/components/employees/edit-employee-form";
import { EmployeeStatusButton } from "@/components/employees/employee-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo consultar el legajo.");
  if (!profile) notFound();
  const company = profile.company_id
    ? await supabase.from("companies").select("id, name").eq("id", profile.company_id).maybeSingle()
    : { data: null, error: null };
  if (company.error) throw new Error("No se pudo consultar la empresa.");
  const { data: access } = user.role === "SUPERADMIN"
    ? { data: [{ can_manage_employees: true }] }
    : await supabase.from("user_company_access").select("can_manage_employees").eq("user_id", user.id).eq("company_id", profile.company_id ?? "");
  const canManage = Boolean(access?.some((item) => item.can_manage_employees));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button asChild size="sm" variant="ghost"><Link href="/admin/empleados"><ArrowLeft className="h-4 w-4" />Volver a empleados</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{company.data?.name ?? "Empresa"}</p><h1 className="mt-1 text-2xl font-semibold">{profile.first_name} {profile.last_name}</h1></div><Badge tone={profile.employment_status === "active" ? "success" : "muted"}>{profile.employment_status === "active" ? "Activo" : profile.employment_status === "leave" ? "Licencia" : "Inactivo"}</Badge></div>
      <Card><CardHeader><CardTitle>Datos del legajo</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><Info label="Legajo" value={profile.employee_number ?? "—"} /><Info label="Correo" value={profile.contact_email ?? "—"} /><Info label="Sector" value={profile.department ?? "—"} /><Info label="Puesto" value={profile.position ?? "—"} /><Info label="Fecha de ingreso" value={formatDate(profile.hire_date)} /><Info label="Estado" value={profile.employment_status} /></dl></CardContent></Card>
      {canManage && <Card><CardHeader><CardTitle>Editar datos del legajo</CardTitle><p className="text-sm text-muted-foreground">Los cambios quedan en el historial de auditoría.</p></CardHeader><CardContent><EditEmployeeForm profile={profile} /></CardContent></Card>}
      {canManage && profile.employment_status !== "leave" && <Card><CardHeader><CardTitle>Estado laboral</CardTitle></CardHeader><CardContent><EmployeeStatusButton id={profile.id} active={profile.employment_status === "active"} /></CardContent></Card>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-900/60 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>;
}
