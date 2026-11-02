import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseMigrationNotice } from "@/components/admin/database-migration-notice";
import { PayrollDownloadButton } from "@/components/payroll/payroll-download-button";
import { UploadPayrollSlipForm, type PayrollEmployeeOption } from "@/components/payroll/upload-payroll-slip-form";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { Company } from "@/types/database";

export default async function AdminPayrollPage() {
  const user = await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_documents").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron consultar las empresas asignadas.");
  const companies = (companyData ?? []) as Company[];
  const manageableCompanies = user.role === "SUPERADMIN"
    ? companies
    : companies.filter((company) => accessRows?.some(
      (access) => access.company_id === company.id && access.can_manage_documents
    ));
  const visibleCompanies = user.role === "GERENTE"
    ? companies.filter((company) => accessRows?.some((access) => access.company_id === company.id))
    : manageableCompanies;
  const companyIds = visibleCompanies.map((company) => company.id);
  const [{ data: slipData, error: slipsError }, { data: employeeData, error: employeesError }] = await Promise.all([
    supabase.from("payroll_slips")
      .select("id, employee_id, company_id, pay_period")
      .order("pay_period", { ascending: false })
      .limit(500),
    companyIds.length
      ? supabase.from("profiles")
        .select("id, first_name, last_name, employee_number, company_id")
        .in("company_id", companyIds)
        .order("last_name")
        .limit(2000)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (slipsError && isMissingTableError(slipsError)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Recibos de sueldo</h1>
          <p className="mt-2 text-sm text-muted-foreground">Gestión de recibos privados de empleados.</p>
        </div>
        <DatabaseMigrationNotice
          title="La gestión de recibos todavía no está disponible"
          description="La base de datos conectada aún no tiene la tabla de recibos de sueldo."
        />
      </div>
    );
  }
  if (slipsError || employeesError) {
    console.error("admin_payroll_load_failed", {
      slipsCode: slipsError?.code ?? "none",
      employeesCode: employeesError?.code ?? "none"
    });
    throw new Error("No se pudieron cargar los recibos y legajos. Revisá la conexión y los permisos de Supabase.");
  }

  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
  const employees = (employeeData ?? []).flatMap((employee) => {
    const companyName = employee.company_id ? companyNameById.get(employee.company_id) : null;
    return companyName ? [{ ...employee, company_name: companyName }] : [];
  }) as PayrollEmployeeOption[];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recibos de sueldo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cargá recibos PDF privados. El portal conserva y muestra los recibos del último año.</p>
      </div>
      {user.role !== "GERENTE" && manageableCompanies.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Cargar recibo</CardTitle></CardHeader>
          <CardContent><UploadPayrollSlipForm employees={employees} /></CardContent>
        </Card>
      )}
      {user.role !== "GERENTE" && !manageableCompanies.length && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          No tenés permisos para gestionar recibos de sueldo en ninguna empresa asignada.
        </p>
      )}
      <Card>
        <CardHeader><CardTitle>Recibos recientes</CardTitle><p className="text-sm text-muted-foreground">Solo se conservan disponibles los documentos del último año.</p></CardHeader>
        <CardContent>
          {!slipData?.length ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-7 text-center text-sm text-muted-foreground">No hay recibos cargados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr><th className="pb-3 font-medium">Empleado</th><th className="pb-3 font-medium">Empresa</th><th className="pb-3 font-medium">Fecha del recibo</th><th className="pb-3" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {slipData.map((slip) => {
                    const employee = employeeById.get(slip.employee_id);
                    return (
                      <tr key={slip.id}>
                        <td className="py-4">{employee ? `${employee.last_name}, ${employee.first_name}` : "Empleado"}</td>
                        <td className="py-4">{companyNameById.get(slip.company_id) ?? "—"}</td>
                        <td className="py-4">{formatDate(slip.pay_period)}</td>
                        <td className="py-4 text-right"><PayrollDownloadButton id={slip.id} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
