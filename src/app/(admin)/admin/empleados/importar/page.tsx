import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmployeeCsvImportForm } from "@/components/employees/employee-csv-import-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { Company } from "@/types/database";

export default async function ImportEmployeesPage() {
  const user = await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
  const supabase = await createClient();
  const [{ data: companyData, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("user_company_access").select("company_id, can_manage_employees").eq("user_id", user.id)
  ]);
  if (companiesError || accessError) throw new Error("No se pudieron cargar las empresas habilitadas.");
  const allCompanies = (companyData ?? []) as Company[];
  const manageable = user.role === "SUPERADMIN"
    ? allCompanies
    : allCompanies.filter((company) =>
        accessRows?.some((access) => access.company_id === company.id && access.can_manage_employees)
      );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/empleados"><ArrowLeft className="h-4 w-4" />Volver a empleados</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Importar empleados</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Validá los datos antes de enviar invitaciones. Cada fila se procesa por separado y el resultado informa altas y errores.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Importación CSV</CardTitle></CardHeader>
        <CardContent>
          {manageable.length
            ? <EmployeeCsvImportForm companies={manageable} />
            : <p className="text-sm text-amber-300">No tenés permiso para administrar empleados en ninguna empresa activa.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
