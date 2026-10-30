import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { ResolveRequestPanel } from "@/components/requests/resolve-request-panel";
import { StatusBadge } from "@/components/requests/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTypeLabels } from "@/lib/utils";
import { RequestComment, RequestHistoryEntry } from "@/types/hr";

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo consultar la solicitud.");
  if (!request) notFound();

  const [
    { data: employee, error: employeeError },
    { data: company, error: companyError },
    { data: history, error: historyError },
    { data: comments, error: commentsError }
  ] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, employee_number, department, position").eq("id", request.employee_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", request.company_id).maybeSingle(),
    supabase.from("request_history").select("id, actor_id, previous_status, new_status, action, created_at").eq("request_id", id).order("created_at"),
    supabase.from("request_comments").select("id, author_id, body, internal, created_at").eq("request_id", id).order("created_at")
  ]);
  if (employeeError || companyError || historyError || commentsError) throw new Error("No se pudo cargar el detalle completo.");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/solicitudes"><ArrowLeft className="h-4 w-4" />Volver a solicitudes</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Solicitud #{request.id.slice(0, 8).toUpperCase()} · {company?.name ?? "Empresa"}</p><h1 className="mt-1 text-2xl font-semibold">{requestTypeLabels[request.request_type]}</h1></div><StatusBadge status={request.status} /></div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-5">
          <Card><CardHeader><CardTitle>Empleado</CardTitle></CardHeader><CardContent><dl className="grid gap-3 sm:grid-cols-2"><Info label="Nombre" value={employee ? `${employee.first_name} ${employee.last_name}` : "Empleado"} /><Info label="Legajo" value={employee?.employee_number ?? "—"} /><Info label="Sector" value={employee?.department ?? "—"} /><Info label="Puesto" value={employee?.position ?? "—"} /></dl></CardContent></Card>
          <Card><CardHeader><CardTitle>Información enviada</CardTitle></CardHeader><CardContent><dl className="grid gap-3 sm:grid-cols-2">{Object.entries(request.payload).map(([key, value]) => <Info key={key} label={fieldLabel(key)} value={String(value)} />)}<Info label="Fecha de creación" value={formatDate(request.created_at)} /></dl></CardContent></Card>
          <Card><CardHeader><CardTitle>Resolver solicitud</CardTitle></CardHeader><CardContent><ResolveRequestPanel requestId={request.id} version={request.version} status={request.status} /></CardContent></Card>
          {!!comments?.length && <Card><CardHeader><CardTitle>Comentarios e historial de revisión</CardTitle></CardHeader><CardContent className="space-y-3">{(comments as RequestComment[]).map((comment) => <div key={comment.id} className={`rounded-lg border p-3 ${comment.internal ? "border-amber-500/20 bg-amber-500/5" : "border-slate-700"}`}><p className="whitespace-pre-wrap text-sm">{comment.body}</p><p className="mt-2 text-xs text-muted-foreground">{comment.internal ? "Nota interna" : "Visible para el empleado"} · {formatDate(comment.created_at)}</p></div>)}</CardContent></Card>}
        </div>
        <Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4" />Trazabilidad</CardTitle></CardHeader><CardContent><ol className="space-y-4">{(history as RequestHistoryEntry[]).map((entry) => <li key={entry.id} className="border-l border-slate-700 pl-4"><p className="text-sm font-medium">{historyLabel(entry.action)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.created_at)}</p></li>)}</ol></CardContent></Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-900/60 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd></div>;
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    leave_type: "Tipo de licencia", start_date: "Fecha desde", end_date: "Fecha hasta",
    calendar_days: "Días calendario estimados", reason: "Motivo", observations: "Observaciones",
    item_name: "Elemento", quantity: "Cantidad", phone: "Teléfono", contact_email: "Correo de contacto",
    address: "Domicilio", subject: "Asunto", details: "Detalle"
  };
  return labels[key] ?? key;
}

function historyLabel(action: string) {
  const labels: Record<string, string> = {
    created: "Solicitud creada", reviewed: "Pasó a revisión", observed: "Solicitud observada",
    approved: "Solicitud aprobada", rejected: "Solicitud rechazada", cancelled: "Solicitud cancelada"
  };
  return labels[action] ?? "Actualización";
}
