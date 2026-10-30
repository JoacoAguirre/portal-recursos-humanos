import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResolvePersonalChangeButton } from "@/components/requests/resolve-personal-change-button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTypeLabels } from "@/lib/utils";
import { RequestStatus, RequestType } from "@/types/database";
import { AdminRequestRow } from "@/types/hr";

const statuses: RequestStatus[] = ["pending", "in_review", "observed", "approved", "rejected", "cancelled"];
const types: RequestType[] = ["leave", "vacation", "epp", "personal_data", "other"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminRequestsPage({
  searchParams
}: {
  searchParams: Promise<{ estado?: string; tipo?: string; empresa?: string; q?: string; page?: string }>;
}) {
  await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: companies, error: companyError } = await supabase.from("companies").select("id, name").eq("active", true).order("name");
  if (companyError) throw new Error("No se pudieron consultar tus empresas.");
  const status = statuses.includes(params.estado as RequestStatus) ? params.estado as RequestStatus : null;
  const type = types.includes(params.tipo as RequestType) ? params.tipo as RequestType : null;
  const requestedCompanyId = params.empresa ?? "";
  const companyId = uuidPattern.test(requestedCompanyId) && companies?.some((company) => company.id === requestedCompanyId) ? requestedCompanyId : null;
  const search = (params.q ?? "").replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ.-]/g, "").trim().slice(0, 60);
  const pageSize = 20;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));

  let employeeIds: string[] | null = null;
  if (search) {
    let profileQuery = supabase.from("profiles").select("id").or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%`
    );
    if (companyId) profileQuery = profileQuery.eq("company_id", companyId);
    const { data: matches, error } = await profileQuery.limit(1000);
    if (error) throw new Error("No se pudo ejecutar la búsqueda de empleados.");
    employeeIds = (matches ?? []).map((profile) => profile.id);
  }

  let query = supabase.from("requests").select(
    "id, employee_id, company_id, request_type, status, payload, created_at, version",
    { count: "exact" }
  ).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("request_type", type);
  if (companyId) query = query.eq("company_id", companyId);
  if (employeeIds?.length) query = query.in("employee_id", employeeIds);
  const { data: requests, count, error: requestsError } = employeeIds && !employeeIds.length
    ? { data: [], count: 0, error: null }
    : await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (requestsError) throw new Error("No se pudieron consultar las solicitudes.");
  const employeeIdsOnPage = [...new Set((requests ?? []).map((request) => request.employee_id))];
  const companyIdsOnPage = [...new Set((requests ?? []).map((request) => request.company_id))];
  const [{ data: employees, error: employeeError }, { data: requestCompanies, error: requestCompanyError }] = await Promise.all([
    employeeIdsOnPage.length ? supabase.from("profiles").select("id, first_name, last_name, employee_number").in("id", employeeIdsOnPage) : Promise.resolve({ data: [], error: null }),
    companyIdsOnPage.length ? supabase.from("companies").select("id, name").in("id", companyIdsOnPage) : Promise.resolve({ data: [], error: null })
  ]);
  if (employeeError || requestCompanyError) throw new Error("No se pudieron completar los datos de las solicitudes.");
  const employeeMap = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const companyMap = new Map((requestCompanies ?? []).map((company) => [company.id, company.name]));
  const rows: AdminRequestRow[] = (requests ?? []).map((request) => {
    const employee = employeeMap.get(request.employee_id);
    return {
      ...request,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "Empleado",
      employeeNumber: employee?.employee_number ?? null,
      companyName: companyMap.get(request.company_id) ?? "Empresa"
    };
  });
  let changesQuery = supabase
    .from("personal_data_change_requests")
    .select("id, employee_id, company_id, requested_data, status, created_at")
    .in("status", ["pending", "in_review", "observed"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (companyId) changesQuery = changesQuery.eq("company_id", companyId);
  const { data: changes, error: changesError } = await changesQuery;
  if (changesError) throw new Error("No se pudieron consultar las solicitudes de actualización de datos.");
  const changeEmployeeIds = [...new Set((changes ?? []).map((change) => change.employee_id))];
  const { data: changeEmployees, error: changeEmployeesError } = changeEmployeeIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, employee_number").in("id", changeEmployeeIds)
    : { data: [], error: null };
  if (changeEmployeesError) throw new Error("No se pudieron cargar los datos de las solicitudes de cambio.");
  const changeEmployeeMap = new Map((changeEmployees ?? []).map((employee) => [employee.id, employee]));

  return <RequestsContent rows={rows} count={count ?? 0} page={page} pageSize={pageSize} companies={companies ?? []} selected={{ status, type, companyId, search }} personalChanges={(changes ?? []).map((change) => ({ ...change, employee: changeEmployeeMap.get(change.employee_id) }))} />;
}

function RequestsContent({
  rows, count, page, pageSize, companies,   selected,
  personalChanges
}: {
  rows: AdminRequestRow[];
  count: number;
  page: number;
  pageSize: number;
  companies: { id: string; name: string }[];
  selected: { status: RequestStatus | null; type: RequestType | null; companyId: string | null; search: string };
  personalChanges: {
    id: string;
    requested_data: Record<string, unknown>;
    status: RequestStatus;
    created_at: string;
    employee?: { first_name: string; last_name: string; employee_number: string | null };
  }[];
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const params = new URLSearchParams();
  if (selected.status) params.set("estado", selected.status);
  if (selected.type) params.set("tipo", selected.type);
  if (selected.companyId) params.set("empresa", selected.companyId);
  if (selected.search) params.set("q", selected.search);
  const query = params.toString();
  const pageLink = (target: number) => `/admin/solicitudes?${query ? `${query}&` : ""}page=${target}`;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Solicitudes</h1><p className="mt-2 text-sm text-muted-foreground">Filtrá, revisá y resolvé solicitudes de las empresas habilitadas.</p></div>
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1.5"><label htmlFor="q" className="text-xs text-muted-foreground">Empleado o legajo</label><input id="q" name="q" defaultValue={selected.search} maxLength={60} className="h-10 rounded-lg border bg-slate-900 px-3 text-sm" /></div>
        <div className="space-y-1.5"><label htmlFor="empresa" className="text-xs text-muted-foreground">Empresa</label><select id="empresa" name="empresa" defaultValue={selected.companyId ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="tipo" className="text-xs text-muted-foreground">Tipo</label><select id="tipo" name="tipo" defaultValue={selected.type ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todos</option>{types.map((item) => <option value={item} key={item}>{requestTypeLabels[item]}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="estado" className="text-xs text-muted-foreground">Estado</label><select id="estado" name="estado" defaultValue={selected.status ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todos</option>{statuses.map((item) => <option value={item} key={item}>{item.replace("_", " ")}</option>)}</select></div>
        <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Aplicar filtros</Button></div>
      </form>
      {!!personalChanges.length && (
        <section className="space-y-3">
          <div><h2 className="text-lg font-semibold">Actualizaciones de datos personales</h2><p className="mt-1 text-sm text-muted-foreground">Los cambios solo se aplican al perfil al ser aprobados.</p></div>
          {personalChanges.map((change) => (
            <Card key={change.id}><CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{change.employee ? `${change.employee.first_name} ${change.employee.last_name}` : "Empleado"}</p><p className="mt-1 text-xs text-muted-foreground">Legajo {change.employee?.employee_number ?? "—"} · {formatDate(change.created_at)}</p></div>
                <Badge tone={change.status === "observed" ? "warning" : "muted"}>{change.status.replace("_", " ")}</Badge>
              </div>
              <dl className="mt-4 grid gap-2 sm:grid-cols-3">{Object.entries(change.requested_data).map(([field, value]) => <div key={field} className="rounded-lg bg-slate-900/60 p-3"><dt className="text-xs text-muted-foreground">{personalFieldLabel(field)}</dt><dd className="mt-1 break-words text-sm">{String(value)}</dd></div>)}</dl>
              <ResolvePersonalChangeButton id={change.id} />
            </CardContent></Card>
          ))}
        </section>
      )}
      <Card><CardContent className="p-0">
        {!rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">No se encontraron solicitudes para estos filtros.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-slate-700 bg-slate-900/40 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Empleado</th><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Tipo</th><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-slate-700">
                {rows.map((request) => <tr key={request.id} className="hover:bg-slate-800/30"><td className="px-5 py-4"><p className="font-medium">{request.employeeName}</p><p className="mt-1 text-xs text-muted-foreground">Legajo {request.employeeNumber ?? "—"}</p></td><td className="px-4 py-4">{request.companyName}</td><td className="px-4 py-4">{requestTypeLabels[request.request_type]}</td><td className="px-4 py-4">{formatDate(request.created_at)}</td><td className="px-4 py-4"><StatusBadge status={request.status} /></td><td className="px-5 py-4 text-right"><Link className="text-blue-400 hover:text-blue-300" href={`/admin/solicitudes/${request.id}`}>Revisar</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-700 px-5 py-4 text-sm">
          <span className="text-muted-foreground">{count} resultado(s) · Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild variant="secondary" size="sm"><Link href={pageLink(page - 1)}>Anterior</Link></Button>}
            {page < totalPages && <Button asChild variant="secondary" size="sm"><Link href={pageLink(page + 1)}>Siguiente</Link></Button>}
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}

function personalFieldLabel(field: string) {
  return ({ phone: "Teléfono solicitado", contact_email: "Correo solicitado", address: "Domicilio solicitado" } as Record<string, string>)[field] ?? field;
}
