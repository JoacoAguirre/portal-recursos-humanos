import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCheck, Clock3, FileText } from "lucide-react";
import { cancelRequestAction } from "@/app/actions/requests";
import { CancelRequestButton } from "@/components/requests/cancel-request-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTypeLabels } from "@/lib/utils";
import { RequestComment, RequestHistoryEntry } from "@/types/hr";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["EMPLEADO"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo consultar la solicitud.");
  if (!request) notFound();

  const [{ data: history, error: historyError }, { data: comments, error: commentsError }] = await Promise.all([
    supabase.from("request_history").select("id, actor_id, previous_status, new_status, action, created_at").eq("request_id", id).order("created_at"),
    supabase.from("request_comments").select("id, author_id, body, created_at").eq("request_id", id).order("created_at")
  ]);
  if (historyError || commentsError) throw new Error("No se pudo cargar el historial de la solicitud.");
  const payload = Object.entries(request.payload).filter(([, value]) => value !== "" && value !== null);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button asChild variant="ghost" size="sm"><Link href="/portal/solicitudes"><ArrowLeft className="h-4 w-4" />Volver</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Solicitud #{request.id.slice(0, 8).toUpperCase()}</p><h1 className="mt-1 text-2xl font-semibold">{requestTypeLabels[request.request_type]}</h1></div>
        <StatusBadge status={request.status} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>Detalle enviado</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {payload.map(([key, value]) => (
                <div key={key} className="rounded-lg bg-slate-900/60 p-3">
                  <dt className="text-xs text-muted-foreground">{fieldLabel(key)}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{String(value)}</dd>
                </div>
              ))}
              <div className="rounded-lg bg-slate-900/60 p-3"><dt className="text-xs text-muted-foreground">Fecha de creación</dt><dd className="mt-1 text-sm">{formatDate(request.created_at)}</dd></div>
            </dl>
            {request.status === "pending" && <div className="mt-5 border-t border-slate-700 pt-4"><CancelRequestButton requestId={request.id} version={request.version} cancelAction={cancelRequestAction} /></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4" />Historial</CardTitle></CardHeader>
          <CardContent>
            {!history?.length ? <p className="text-sm text-muted-foreground">No hay movimientos registrados.</p> : (
              <ol className="space-y-4">
                {(history as RequestHistoryEntry[]).map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-0.5 rounded-full bg-blue-500/10 p-1.5 text-blue-300">{entry.action === "approved" ? <CheckCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                    <div><p className="text-sm font-medium">{historyLabel(entry.action)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.created_at)}</p></div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {!!comments?.length && (
        <Card><CardHeader><CardTitle>Comentarios</CardTitle></CardHeader><CardContent className="space-y-3">
          {(comments as RequestComment[]).map((comment) => <div key={comment.id} className="rounded-lg border border-slate-700 p-3"><p className="whitespace-pre-wrap text-sm">{comment.body}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(comment.created_at)}</p></div>)}
        </CardContent></Card>
      )}
    </div>
  );
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
    created: "Solicitud creada", reviewed: "Solicitud en revisión", observed: "Solicitud observada",
    approved: "Solicitud aprobada", rejected: "Solicitud rechazada", cancelled: "Solicitud cancelada"
  };
  return labels[action] ?? "Solicitud actualizada";
}
