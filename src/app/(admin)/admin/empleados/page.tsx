import Link from "next/link";
import { FileUp, Plus, Search } from "lucide-react";
import { EmployeeStatusButton } from "@/components/employees/employee-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Company } from "@/types/database";

export default async function EmployeesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; empresa?: string; estado?: string; page?: string }>;
}) {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_employees").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron consultar las empresas asignadas.");
  const companies = (companyData ?? []) as Company[];
  const manageableIds = user.role === "SUPERADMIN"
    ? new Set(companies.map((company) => company.id))
    : new Set((accessRows ?? []).filter((row) => row.can_manage_employees).map((row) => row.company_id));
  const requestedCompany = params.empresa ?? "";
  const companyId = companies.some((company) => company.id === requestedCompany) ? requestedCompany : null;
  const search = (params.q ?? "").replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ.-]/g, "").trim().slice(0, 60);
  const status = params.estado === "active" || params.estado === "inactive" || params.estado === "leave"
    ? params.estado
    : null;
  const pageSize = 25;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));

  let query = supabase.from("profiles").select("*", { count: "exact" }).order("last_name").order("first_name");
  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("employment_status", status);
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%`);
  const { data: employees, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("No se pudieron cargar los empleados.");

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
  const queryParams = new URLSearchParams();
  if (search) queryParams.set("q", search);
  if (companyId) queryParams.set("empresa", companyId);
  if (status) queryParams.set("estado", status);
  const prefix = queryParams.toString();
  const pageHref = (target: number) => `/admin/empleados?${prefix ? `${prefix}&` : ""}page=${target}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Empleados</h1><p className="mt-2 text-sm text-muted-foreground">Legajos activos y registros históricos de tus empresas.</p></div>
        {manageableIds.size > 0 && <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/admin/empleados/importar"><FileUp className="h-4 w-4" />Importar CSV</Link></Button>
          <Button asChild><Link href="/admin/empleados/nuevo"><Plus className="h-4 w-4" />Invitar empleado</Link></Button>
        </div>}
      </div>
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5"><label htmlFor="q" className="text-xs text-muted-foreground">Nombre, apellido o legajo</label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input id="q" name="q" defaultValue={search} maxLength={60} className="h-10 w-full rounded-lg border bg-slate-900 pl-9 pr-3 text-sm" /></div></div>
        <div className="space-y-1.5"><label htmlFor="empresa" className="text-xs text-muted-foreground">Empresa</label><select id="empresa" name="empresa" defaultValue={companyId ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="estado" className="text-xs text-muted-foreground">Estado</label><select id="estado" name="estado" defaultValue={status ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todos</option><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="leave">Licencia</option></select></div>
        <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Filtrar</Button></div>
      </form>
      <Card><CardContent className="p-0">
        {!employees?.length ? <p className="p-8 text-center text-sm text-muted-foreground">No se encontraron empleados con esos filtros.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-700 bg-slate-900/40 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Empleado</th><th className="px-4 py-3 font-medium">Legajo</th><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Sector / puesto</th><th className="px-4 py-3 font-medium">Ingreso</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-slate-700">{employees.map((employee) => {
                const active = employee.employment_status === "active";
                const canManage = Boolean(employee.company_id && manageableIds.has(employee.company_id));
                return <tr key={employee.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-4"><Link className="font-medium hover:text-blue-300" href={`/admin/empleados/${employee.id}`}>{employee.first_name} {employee.last_name}</Link><p className="mt-1 text-xs text-muted-foreground">{employee.contact_email ?? "Sin correo de contacto"}</p></td>
                  <td className="px-4 py-4">{employee.employee_number ?? "—"}</td><td className="px-4 py-4">{employee.company_id ? companyNameById.get(employee.company_id) ?? "—" : "Global"}</td>
                  <td className="px-4 py-4">{employee.department ?? "—"}<p className="mt-1 text-xs text-muted-foreground">{employee.position ?? "—"}</p></td>
                  <td className="px-4 py-4">{formatDate(employee.hire_date)}</td>
                  <td className="px-4 py-4"><Badge tone={active ? "success" : "muted"}>{employee.employment_status === "active" ? "Activo" : employee.employment_status === "leave" ? "Licencia" : "Inactivo"}</Badge></td>
                  <td className="px-5 py-4 text-right">{canManage && employee.employment_status !== "leave" && <EmployeeStatusButton id={employee.id} active={active} />}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-700 px-5 py-4 text-sm"><span className="text-muted-foreground">{count ?? 0} empleado(s) · Página {page} de {totalPages}</span><div className="flex gap-2">{page > 1 && <Button asChild variant="secondary" size="sm"><Link href={pageHref(page - 1)}>Anterior</Link></Button>}{page < totalPages && <Button asChild variant="secondary" size="sm"><Link href={pageHref(page + 1)}>Siguiente</Link></Button>}</div></div>
      </CardContent></Card>
    </div>
  );
}
