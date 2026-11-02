import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DatabaseMigrationNotice({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-200">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{description}</p>
        <p>
          Aplicá la migración{" "}
          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200">
            supabase/migrations/202611020001_employee_access_vacations_payroll.sql
          </code>{" "}
          en Supabase y luego recargá esta página.
        </p>
      </CardContent>
    </Card>
  );
}
