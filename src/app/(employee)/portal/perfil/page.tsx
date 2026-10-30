import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PersonalDataChangeForm } from "@/components/profile/personal-data-change-form";

export default async function EmployeeProfilePage({ searchParams }: { searchParams: Promise<{ solicitud?: string }> }) {
  const user = await requireUser(["EMPLEADO"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error("No se pudo consultar tu perfil.");
  if (!profile) notFound();
  const { data: changes, error: changesError } = await supabase
    .from("personal_data_change_requests")
    .select("id, requested_data, status, review_comment, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (changesError) throw new Error("No se pudo consultar el historial de cambios.");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-2xl font-semibold">Mi perfil</h1><p className="mt-2 text-sm text-muted-foreground">Consultá tus datos y solicitá una actualización cuando sea necesario.</p></div>
      {params.solicitud === "enviada" && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">Tu solicitud de actualización fue enviada a Recursos Humanos.</p>}
      <Card><CardHeader><CardTitle>Datos del legajo</CardTitle></CardHeader><CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <ProfileField label="Nombre y apellido" value={`${profile.first_name} ${profile.last_name}`} />
          <ProfileField label="Legajo" value={profile.employee_number ?? "No asignado"} />
          <ProfileField label="Empresa" value={user.companyName ?? "No asignada"} />
          <ProfileField label="Sector" value={profile.department ?? "—"} />
          <ProfileField label="Puesto" value={profile.position ?? "—"} />
          <ProfileField label="Fecha de ingreso" value={formatDate(profile.hire_date)} />
          <ProfileField label="Teléfono" value={profile.phone ?? "—"} />
          <ProfileField label="Correo de contacto" value={profile.contact_email ?? "—"} />
          <ProfileField label="Domicilio" value={profile.address ?? "—"} />
        </dl>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Solicitar actualización</CardTitle></CardHeader><CardContent><PersonalDataChangeForm /></CardContent></Card>
      <Card><CardHeader><CardTitle>Solicitudes de cambio recientes</CardTitle></CardHeader><CardContent>
        {!changes?.length ? <p className="text-sm text-muted-foreground">No hay solicitudes de cambio registradas.</p> : (
          <div className="divide-y divide-slate-700">{changes.map((change) => (
            <div key={change.id} className="flex flex-wrap justify-between gap-2 py-3 first:pt-0">
              <div><p className="text-sm font-medium">Actualización de datos personales</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(change.created_at)}</p></div>
              <div className="text-right"><span className="text-sm capitalize text-slate-300">{change.status.replace("_", " ")}</span>{change.review_comment && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{change.review_comment}</p>}</div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-900/60 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>;
}
