import { FileText, ReceiptText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PayrollDownloadButton } from "@/components/payroll/payroll-download-button";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate, subtractCalendarYears, todayInTimeZone } from "@/lib/utils";

export default async function MyPayrollPage() {
  await requireUser(["EMPLEADO"]);
  const cutoff = subtractCalendarYears(todayInTimeZone(), 1);
  const supabase = await createClient();
  const { data: slips, error } = await supabase
    .from("payroll_slips")
    .select("id, pay_period")
    .gte("pay_period", cutoff)
    .order("pay_period", { ascending: false });
  if (error) throw new Error("No se pudieron cargar tus recibos de sueldo.");

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Mis recibos de sueldo</h1><p className="mt-2 text-sm text-muted-foreground">Descargá tus recibos privados. Los archivos disponibles se conservan durante un año.</p></div>
      <Card><CardContent className="p-5">
        {!slips?.length ? (
          <div className="py-8 text-center"><ReceiptText className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm font-medium">Todavía no hay recibos disponibles</p><p className="mt-1 text-xs text-muted-foreground">Cuando RR. HH. cargue un recibo, aparecerá en esta sección.</p></div>
        ) : (
          <ul className="divide-y divide-slate-700">
            {slips.map((slip) => (
              <li key={slip.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-blue-300" /><div><p className="text-sm font-medium">Recibo de sueldo</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(slip.pay_period)}</p></div></div>
                <PayrollDownloadButton id={slip.id} />
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}
