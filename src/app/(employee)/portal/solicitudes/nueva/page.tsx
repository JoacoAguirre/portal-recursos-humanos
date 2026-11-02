import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, todayInTimeZone } from "@/lib/utils";
import type { EppItem } from "@/types/hr";
import type { VacationRequestPeriod } from "@/lib/vacations";

export default async function NewRequestPage() {
  const user = await requireUser(["EMPLEADO"]);
  const supabase = await createClient();
  const [
    { data: catalogData, error: catalogError },
    { data: vacationData, error: vacationError }
  ] = await Promise.all([
    supabase.from("epp_catalog").select("id, name, description").eq("active", true).order("name"),
    supabase.from("requests").select("status, payload").eq("employee_id", user.id).eq("request_type", "vacation")
  ]);
  if (catalogError) throw new Error("No se pudo consultar el catálogo de ropa y EPP.");
  if (vacationError) throw new Error("No se pudieron consultar tus solicitudes de vacaciones.");
  const catalog = (catalogData ?? []) as EppItem[];
  const vacationRequests = (vacationData ?? []) as VacationRequestPeriod[];
  const minimumDate = addCalendarDays(todayInTimeZone(), 30);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" size="sm"><Link href="/portal/solicitudes"><ArrowLeft className="h-4 w-4" />Volver a mis solicitudes</Link></Button>
      <div><h1 className="text-2xl font-semibold">Nueva solicitud</h1><p className="mt-2 text-sm text-muted-foreground">Completá la información para que Recursos Humanos pueda revisarla.</p></div>
      <Card>
        <CardHeader><CardTitle>Detalle de la solicitud</CardTitle></CardHeader>
        <CardContent><NewRequestForm
          catalog={catalog}
          minimumDate={minimumDate}
          hireDate={user.profile.hire_date}
          vacationRequests={vacationRequests}
        /></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Las fechas de licencias y vacaciones deben solicitarse con al menos 30 días de anticipación.</p>
    </div>
  );
}
