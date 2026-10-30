import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FileWarning, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDate, requestTypeLabels, todayInTimeZone } from "@/lib/utils";
import { Company } from "@/types/database";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: companyData, error: companiesError } = await supabase.from("companies").select("*").eq("active", true).order("name");
  if (companiesError) throw new Error("No se pudieron cargar las empresas disponibles.");
  const companies = (companyData ?? []) as Company[];
  const requestedCompanyId = params.empresa ?? "";
  const companyId = companies.some((company) => company.id === requestedCompanyId) ? requestedCompanyId : null;
  let recentQuery = supabase
    .from("requests")
    .select("id, employee_id, company_id, request_type, status, payload, created_at, version")
    .order("created_at", { ascending: false })
    .limit(5);
  if (companyId) recentQuery = recentQuery.eq("company_id", companyId);
  const today = todayInTimeZone();
  const inThirtyDays = addCalendarDays(today, 30);
  let employeesQuery = supabase.from("profiles").select("id", { count: "exact", head: true }).eq("employment_status", "active");
  let pendingQuery = supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  let reviewQuery = supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "in_review");
  let eppQuery = supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "pending").eq("request_type", "epp");
  let expiredQuery = supabase.from("employee_documents").select("id", { count: "exact", head: true }).eq("active", true).lt("expiration_date", today);
  let expiringQuery = supabase.from("employee_documents").select("id", { count: "exact", head: true }).eq("active", true).gte("expiration_date", today).lte("expiration_date", inThirtyDays);
  if (companyId) {
    employeesQuery = employeesQuery.eq("company_id", companyId);
    pendingQuery = pendingQuery.eq("company_id", companyId);
    reviewQuery = reviewQuery.eq("company_id", companyId);
    eppQuery = eppQuery.eq("company_id", companyId);
    expiredQuery = expiredQuery.eq("company_id", companyId);
    expiringQuery = expiringQuery.eq("company_id", companyId);
  }
  const [
    { data: requestRows, error: requestsError },
    employees,
    pending,
    inReview,
    epp,
    expired,
    expiring
  ] = await Promise.all([recentQuery, employeesQuery, pendingQuery, reviewQuery, eppQuery, expiredQuery, expiringQuery]);
  if (requestsError || [employees, pending, inReview, epp, expired, expiring].some((result) => result.error)) {
    throw new Error("No se pudieron cargar los indicadores del tablero.");
  }
  const visibleRows = requestRows ?? [];
  const employeeIds = [...new Set(visibleRows.map((request) => request.employee_id))];
  const companyIds = [...new Set(visibleRows.map((request) => request.company_id))];
  const [{ data: profiles }, { data: requestCompanies }] = await Promise.all([
    employeeIds.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null })
  ]);
  const staffById = new Map((profiles ?? []).map((profile) => [profile.id, `${profile.first_name} ${profile.last_name}`]));
  const companyById = new Map((requestCompanies ?? []).map((company) => [company.id, company.name]));
  const rows = visibleRows.map((request) => ({
    ...request,
    employeeName: staffById.get(request.employee_id) ?? "Empleado",
    companyName: companyById.get(request.company_id) ?? "Empresa"
  }));
  const selectedCompany = companies.find((company) => company.id === companyId);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Panel de administración</p><h1 className="mt-1 text-2xl font-semibold">Resumen de Recursos Humanos</h1><p className="mt-2 text-sm text-muted-foreground">Indicadores visibles según tus empresas asignadas.</p></div>
        <form className="flex items-center gap-2">
          <label htmlFor="empresa" className="sr-only">Filtrar por empresa</label>
          <select id="empresa" name="empresa" defaultValue={companyId ?? ""} className="h-10 rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Todas las empresas</option>
            {companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </form>
      </div>
      {selectedCompany && <p className="text-sm text-blue-300">Empresa seleccionada: {selectedCompany.name}</p>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric title="Empleados activos" value={employees.count ?? 0} icon={<Users />} detail="En las empresas autorizadas" />
        <Metric title="Solicitudes pendientes" value={pending.count ?? 0} icon={<Clock3 />} detail="Requieren revisión" tone="text-amber-300" />
        <Metric title="En revisión" value={inReview.count ?? 0} icon={<CheckCircle2 />} detail="En gestión" tone="text-blue-300" />
        <Metric title="Documentos vencidos" value={expired.count ?? 0} icon={<AlertTriangle />} detail="Requieren atención" tone="text-red-300" />
        <Metric title="Vencen en 30 días" value={expiring.count ?? 0} icon={<FileWarning />} detail="Documentación próxima" tone="text-amber-300" />
        <Metric title="EPP pendientes" value={epp.count ?? 0} icon={<FileWarning />} detail="Pedidos por revisar" tone="text-violet-300" />
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Últimas solicitudes</CardTitle><p className="mt-2 text-sm text-muted-foreground">Actividad reciente de tus empresas.</p></div>
          <Button asChild variant="ghost" size="sm"><Link href="/admin/solicitudes">Ver todas<ArrowUpRight className="h-4 w-4" /></Link></Button>
        </CardHeader>
        <CardContent>
          {!rows.length ? <p className="rounded-lg border border-dashed border-slate-700 p-7 text-center text-sm text-muted-foreground">No hay solicitudes para mostrar.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-3 font-medium">Empleado</th><th className="pb-3 font-medium">Empresa</th><th className="pb-3 font-medium">Tipo</th><th className="pb-3 font-medium">Fecha</th><th className="pb-3 font-medium">Estado</th><th className="pb-3" /></tr></thead>
                <tbody className="divide-y divide-slate-700">
                  {rows.map((request) => <tr key={request.id}><td className="py-3 font-medium">{request.employeeName}</td><td className="py-3">{request.companyName}</td><td className="py-3">{requestTypeLabels[request.request_type]}</td><td className="py-3">{formatDate(request.created_at)}</td><td className="py-3"><StatusBadge status={request.status} /></td><td className="py-3 text-right"><Link href={`/admin/solicitudes/${request.id}`} className="text-blue-400 hover:text-blue-300">Abrir</Link></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon, detail, tone = "text-slate-300" }: { title: string; value: number; icon: React.ReactNode; detail: string; tone?: string }) {
  return <Card><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className={`rounded-xl bg-slate-900 p-3 ${tone}`}>{icon}</span></CardContent></Card>;
}
