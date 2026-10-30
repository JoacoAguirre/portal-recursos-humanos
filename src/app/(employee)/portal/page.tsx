import Link from "next/link";
import { ArrowUpRight, BellRing, FileClock, FileText, Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDate, requestTypeLabels, todayInTimeZone } from "@/lib/utils";

export default async function EmployeeHomePage() {
  const user = await requireUser(["EMPLEADO"]);
  const supabase = await createClient();
  const [requestsResult, documentsResult, notificationsResult] = await Promise.all([
    supabase.from("requests").select("id, request_type, status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("employee_documents").select("id, document_type, expiration_date, expiration_unknown").eq("active", true),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
  ]);
  const statuses = ["pending", "in_review", "observed", "approved", "rejected", "cancelled"] as const;
  const requestCounts = await Promise.all(statuses.map((status) =>
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", status)
  ));
  if (requestsResult.error || documentsResult.error || notificationsResult.error || requestCounts.some((result) => result.error)) {
    throw new Error("No se pudieron cargar los datos del portal.");
  }

  const requests = requestsResult.data;
  const documents = documentsResult.data;
  const unread = notificationsResult.count;
  const stats = {
    pending: requestCounts[0]?.count ?? 0,
    in_review: requestCounts[1]?.count ?? 0,
    observed: requestCounts[2]?.count ?? 0,
    approved: requestCounts[3]?.count ?? 0,
    rejected: requestCounts[4]?.count ?? 0,
    cancelled: requestCounts[5]?.count ?? 0
  };

  const today = todayInTimeZone();
  const inThirtyDays = addCalendarDays(today, 30);
  const expiring = (documents ?? []).filter(
    (document) => document.expiration_date && document.expiration_date >= today && document.expiration_date <= inThirtyDays
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{user.companyName ?? "Portal del empleado"}</p>
          <h1 className="mt-1 text-2xl font-semibold">Hola, {user.profile.first_name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Consultá tus solicitudes, documentos y novedades personales.</p>
        </div>
        <Button asChild><Link href="/portal/solicitudes/nueva"><Plus className="h-4 w-4" />Nueva solicitud</Link></Button>
      </div>

      <section aria-label="Resumen de solicitudes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Pendientes" value={stats.pending} icon={<ClipboardList />} tone="text-blue-300" />
        <MetricCard title="En revisión" value={stats.in_review} icon={<FileClock />} tone="text-amber-300" />
        <MetricCard title="Aprobadas" value={stats.approved} icon={<FileText />} tone="text-emerald-300" />
        <MetricCard title="Notificaciones sin leer" value={unread ?? 0} icon={<BellRing />} tone="text-violet-300" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Solicitudes recientes</CardTitle><p className="mt-2 text-sm text-muted-foreground">Seguimiento de tus últimos trámites.</p></div>
            <Button asChild variant="ghost" size="sm"><Link href="/portal/solicitudes">Ver todas<ArrowUpRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent>
            {!requests?.length ? (
              <EmptyState title="Todavía no tenés solicitudes" detail="Cuando envíes una solicitud, vas a poder consultar su estado desde acá." />
            ) : (
              <div className="divide-y divide-slate-700">
                {requests.map((request) => (
                  <Link key={request.id} href={`/portal/solicitudes/${request.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0 hover:bg-slate-800/30">
                    <div><p className="text-sm font-medium">{requestTypeLabels[request.request_type]}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)}</p></div>
                    <StatusBadge status={request.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Documentación</CardTitle><p className="mt-2 text-sm text-muted-foreground">Vencimientos próximos informados por RR. HH.</p></CardHeader>
          <CardContent>
            {expiring.length ? (
              <div className="space-y-3">
                {expiring.slice(0, 4).map((document) => (
                  <div key={document.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div><p className="text-sm font-medium">{document.document_type}</p><p className="mt-1 text-xs text-muted-foreground">Vence {formatDate(document.expiration_date)}</p></div>
                    <Badge tone="warning">Próximo</Badge>
                  </div>
                ))}
                <Link href="/portal/documentos" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">Ver documentos<ArrowUpRight className="h-4 w-4" /></Link>
              </div>
            ) : <EmptyState title="Sin vencimientos próximos" detail="No hay documentos que venzan en los próximos 30 días." />}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>
        <span className={`rounded-xl bg-slate-900 p-3 ${tone}`}>{icon}</span>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-lg border border-dashed border-slate-700 px-5 py-8 text-center"><p className="text-sm font-medium">{title}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></div>;
}
