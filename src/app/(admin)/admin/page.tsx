import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, CheckCircle2, ChevronDown, Clock3, FileWarning, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDate, requestTypeLabels, todayInTimeZone } from "@/lib/utils";
import { Company, RequestType } from "@/types/database";

const requestTypes: RequestType[] = ["leave", "vacation", "epp", "personal_data", "other"];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ empresa?: string; tipo?: string; fecha?: string }> }) {
  await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: companyData, error: companiesError } = await supabase.from("companies").select("*").eq("active", true).order("name");
  if (companiesError) throw new Error("No se pudieron cargar las empresas disponibles.");
  const companies = (companyData ?? []) as Company[];
  const requestedCompanyId = params.empresa ?? "";
  const companyId = companies.some((company) => company.id === requestedCompanyId) ? requestedCompanyId : null;
  const requestType = requestTypes.includes(params.tipo as RequestType) ? params.tipo as RequestType : null;
  const dateAscending = params.fecha === "asc";
  let recentQuery = supabase
    .from("requests")
    .select("id, employee_id, company_id, request_type, status, payload, created_at, version")
    .order("created_at", { ascending: false })
    .limit(5);
  if (companyId) recentQuery = recentQuery.eq("company_id", companyId);
  if (requestType) recentQuery = recentQuery.eq("request_type", requestType);
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
  const visibleRows = [...(requestRows ?? [])];
  if (dateAscending) visibleRows.reverse();
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
  const dateSortParams = new URLSearchParams();
  if (companyId) dateSortParams.set("empresa", companyId);
  if (requestType) dateSortParams.set("tipo", requestType);
  dateSortParams.set("fecha", dateAscending ? "desc" : "asc");
  const dateSortHref = `/admin?${dateSortParams.toString()}`;
  const getTypeFilterHref = (type: RequestType | null) => {
    const filterParams = new URLSearchParams();
    if (companyId) filterParams.set("empresa", companyId);
    if (type) filterParams.set("tipo", type);
    filterParams.set("fecha", dateAscending ? "asc" : "desc");
    return `/admin?${filterParams.toString()}`;
  };
  const stickyHeaderClass = "sticky top-16 z-20 bg-card px-3 py-3 font-medium";

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Panel de administración</p><h1 className="mt-1 text-2xl font-semibold">Resumen de Recursos Humanos</h1><p className="mt-2 text-sm text-muted-foreground">Indicadores visibles según tus empresas asignadas.</p></div>
        <form className="flex items-center gap-2">
          <label htmlFor="empresa" className="sr-only">Filtrar por empresa</label>
          {requestType && <input type="hidden" name="tipo" value={requestType} />}
          <input type="hidden" name="fecha" value={dateAscending ? "asc" : "desc"} />
          <select id="empresa" name="empresa" defaultValue={companyId ?? ""} className="h-10 rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Todas las empresas</option>
            {companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </form>
      </div>
      {selectedCompany && <p className="text-sm text-blue-300">Empresa seleccionada: {selectedCompany.name}</p>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric href="/admin/empleados" title="Empleados activos" value={employees.count ?? 0} icon={<Users />} detail="En las empresas autorizadas" />
        <Metric href="/admin/solicitudes?estado=pending" title="Solicitudes pendientes" value={pending.count ?? 0} icon={<Clock3 />} detail="Requieren revisión" tone="text-amber-300" />
        <Metric href="/admin/solicitudes?estado=in_review" title="En revisión" value={inReview.count ?? 0} icon={<CheckCircle2 />} detail="En gestión" tone="text-blue-300" />
        <Metric href="/admin/documentos" title="Documentos vencidos" value={expired.count ?? 0} icon={<AlertTriangle />} detail="Requieren atención" tone="text-red-300" />
        <Metric href="/admin/documentos" title="Vencen en 30 días" value={expiring.count ?? 0} icon={<FileWarning />} detail="Documentación próxima" tone="text-amber-300" />
        <Metric href="/admin/solicitudes?estado=pending&tipo=epp" title="EPP pendientes" value={epp.count ?? 0} icon={<FileWarning />} detail="Pedidos por revisar" tone="text-violet-300" />
      </section>
      <Card>
        <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-4">
          <div><CardTitle>Últimas solicitudes</CardTitle><p className="mt-2 text-sm text-muted-foreground">Actividad reciente de tus empresas.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/admin/solicitudes">Ver todas<ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full min-w-[700px] text-left text-sm md:min-w-0">
              <thead className="text-xs uppercase text-muted-foreground"><tr className="border-b border-slate-700/70"><th className={stickyHeaderClass}>Empleado</th><th className={stickyHeaderClass}>Empresa</th><th className={stickyHeaderClass}><details className="relative w-fit">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 [&::-webkit-details-marker]:hidden">
                  Tipo{requestType ? ` · ${requestTypeLabels[requestType]}` : ""}<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </summary>
                <div className="absolute left-0 top-full z-20 mt-2 min-w-48 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs normal-case shadow-xl">
                  <Link href={getTypeFilterHref(null)} aria-current={!requestType ? "page" : undefined} className="block rounded px-3 py-2 hover:bg-slate-800 aria-[current=page]:text-blue-300">Todos los tipos</Link>
                  {requestTypes.map((type) => <Link key={type} href={getTypeFilterHref(type)} aria-current={requestType === type ? "page" : undefined} className="block rounded px-3 py-2 hover:bg-slate-800 aria-[current=page]:text-blue-300">{requestTypeLabels[type]}</Link>)}
                </div>
              </details></th><th className={stickyHeaderClass}><Link href={dateSortHref} aria-label={`Ordenar fecha ${dateAscending ? "descendente" : "ascendente"}`} className="inline-flex items-center gap-1 rounded hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Fecha {dateAscending ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}</Link></th><th className={stickyHeaderClass}>Estado</th><th className={stickyHeaderClass} /></tr></thead>
              <tbody className="divide-y divide-slate-700">
                {!rows.length
                  ? <tr><td colSpan={6} className="py-7 text-center text-sm text-muted-foreground">No hay solicitudes para mostrar.</td></tr>
                  : rows.map((request) => <tr key={request.id}><td className="py-3 font-medium">{request.employeeName}</td><td className="py-3">{request.companyName}</td><td className="py-3">{requestTypeLabels[request.request_type]}</td><td className="py-3">{formatDate(request.created_at)}</td><td className="py-3"><StatusBadge status={request.status} /></td><td className="py-3 text-right"><Link href={`/admin/solicitudes/${request.id}`} className="text-blue-400 hover:text-blue-300">Abrir</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ href, title, value, icon, detail, tone = "text-slate-300" }: { href: string; title: string; value: number; icon: React.ReactNode; detail: string; tone?: string }) {
  return (
    <Link
      href={href}
      aria-label={`${title}: ${value}. ${detail}. Abrir sección.`}
      className="group block rounded-xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <Card className="h-full transition-[border-color,box-shadow] duration-200 group-hover:border-blue-400/40 group-hover:shadow-md group-hover:shadow-blue-950/20 motion-reduce:transition-none">
        <CardContent className="flex items-start justify-between p-5">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <span className={`rounded-xl bg-slate-900 p-3 transition-colors duration-200 group-hover:bg-blue-950/60 ${tone} motion-reduce:transition-none`}>{icon}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
