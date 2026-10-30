import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeactivateDocumentButton } from "@/components/documents/deactivate-document-button";
import { UploadDocumentForm, DocumentEmployeeOption } from "@/components/documents/upload-document-form";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDate, todayInTimeZone } from "@/lib/utils";
import { Company } from "@/types/database";

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; vencimiento?: string }> }) {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_documents").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron consultar las empresas.");
  const companies = (companyData ?? []) as Company[];
  const manageableCompanies = user.role === "SUPERADMIN"
    ? companies
    : companies.filter((company) => accessRows?.some((access) => access.company_id === company.id && access.can_manage_documents));
  const selectedCompany = companies.some((company) => company.id === params.empresa) ? params.empresa : null;

  let documentQuery = supabase.from("employee_documents")
    .select("id, employee_id, company_id, document_type, issue_date, expiration_date, expiration_unknown, notes, active, created_at")
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (selectedCompany) documentQuery = documentQuery.eq("company_id", selectedCompany);
  const { data: documents, error: documentsError } = await documentQuery;
  if (documentsError) throw new Error("No se pudo cargar la documentación de la empresa.");

  const employeeIds = [...new Set((documents ?? []).map((document) => document.employee_id))];
  const companyIds = [...new Set((documents ?? []).map((document) => document.company_id))];
  const [{ data: employeeRows, error: employeeError }, { data: companyRows, error: companyRowsError }] = await Promise.all([
    employeeIds.length ? supabase.from("profiles").select("id, first_name, last_name, employee_number, company_id").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (employeeError || companyRowsError) throw new Error("No se pudieron cargar los datos de los legajos.");
  const companyNames = new Map((companyRows ?? []).map((company) => [company.id, company.name]));
  const employeesById = new Map((employeeRows ?? []).map((employee) => [employee.id, employee]));
  const options = user.role === "SUPERADMIN"
    ? companies
    : manageableCompanies;
  const { data: employeesForUpload, error: uploadEmployeesError } = options.length
    ? await supabase.from("profiles").select("id, first_name, last_name, employee_number, company_id")
      .in("company_id", options.map((company) => company.id))
      .eq("employment_status", "active")
      .order("last_name")
      .limit(1000)
    : { data: [], error: null };
  if (uploadEmployeesError) throw new Error("No se pudieron cargar empleados para adjuntar documentos.");
  const employeeOptions: DocumentEmployeeOption[] = (employeesForUpload ?? []).flatMap((employee) => {
    const companyName = employee.company_id ? companyNames.get(employee.company_id) ?? companies.find((company) => company.id === employee.company_id)?.name : null;
    return companyName ? [{ ...employee, company_name: companyName }] : [];
  });
  const today = todayInTimeZone();
  const monthEnd = addCalendarDays(today, 30);
  const filter = params.vencimiento;
  const visibleDocuments = (documents ?? []).filter((document) => {
    if (!filter) return true;
    if (filter === "vencido") return !!document.expiration_date && document.expiration_date < today;
    if (filter === "proximo") return !!document.expiration_date && document.expiration_date >= today && document.expiration_date <= monthEnd;
    if (filter === "vigente") return document.active && (!document.expiration_date || document.expiration_date > monthEnd);
    return true;
  });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Documentación</h1><p className="mt-2 text-sm text-muted-foreground">Legajos, archivos privados y fechas de vencimiento.</p></div>
      {manageableCompanies.length > 0 && <Card><CardHeader><CardTitle>Cargar documento</CardTitle></CardHeader><CardContent><UploadDocumentForm employees={employeeOptions} /></CardContent></Card>}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5"><label htmlFor="empresa" className="text-xs text-muted-foreground">Empresa</label><select id="empresa" name="empresa" defaultValue={selectedCompany ?? ""} className="h-10 min-w-48 rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todas</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="vencimiento" className="text-xs text-muted-foreground">Vencimiento</label><select id="vencimiento" name="vencimiento" defaultValue={filter ?? ""} className="h-10 min-w-48 rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todos</option><option value="vencido">Vencidos</option><option value="proximo">Próximos 30 días</option><option value="vigente">Vigentes / sin vencimiento</option></select></div>
        <button type="submit" className="h-10 rounded-lg border bg-slate-800 px-4 text-sm hover:bg-slate-700">Filtrar</button>
      </form>
      <Card><CardHeader><CardTitle>Registros de documentos</CardTitle><p className="text-sm text-muted-foreground">Se muestran hasta 200 registros recientes; los archivos nunca son públicos.</p></CardHeader><CardContent>
        {!visibleDocuments.length ? <p className="rounded-lg border border-dashed border-slate-700 p-7 text-center text-sm text-muted-foreground">No hay documentos para estos filtros.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-3 font-medium">Empleado</th><th className="pb-3 font-medium">Empresa</th><th className="pb-3 font-medium">Documento</th><th className="pb-3 font-medium">Emisión</th><th className="pb-3 font-medium">Vencimiento</th><th className="pb-3 font-medium">Estado</th><th className="pb-3" /></tr></thead>
            <tbody className="divide-y divide-slate-700">{visibleDocuments.map((document) => {
              const employee = employeesById.get(document.employee_id);
              const status = !document.active ? "Baja lógica"
                : !document.expiration_date ? document.expiration_unknown ? "Vencimiento desconocido" : "Sin vencimiento"
                  : document.expiration_date < today ? "Vencido"
                    : document.expiration_date <= monthEnd ? "Próximo" : "Vigente";
              const tone = status === "Vencido" || status === "Baja lógica" ? "danger" : status === "Próximo" || status === "Vencimiento desconocido" ? "warning" : "success";
              const canManage = Boolean(document.company_id && manageableCompanies.some((company) => company.id === document.company_id));
              return <tr key={document.id}><td className="py-4"><p className="font-medium">{employee ? `${employee.last_name}, ${employee.first_name}` : "Empleado"}</p><p className="mt-1 text-xs text-muted-foreground">Legajo {employee?.employee_number ?? "—"}</p></td><td className="py-4">{companyNames.get(document.company_id) ?? "—"}</td><td className="py-4">{document.document_type}</td><td className="py-4">{formatDate(document.issue_date)}</td><td className="py-4">{document.expiration_unknown ? "Desconocido" : formatDate(document.expiration_date)}</td><td className="py-4"><Badge tone={tone}>{status}</Badge></td><td className="py-4 text-right">{document.active && canManage && <DeactivateDocumentButton id={document.id} />}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
