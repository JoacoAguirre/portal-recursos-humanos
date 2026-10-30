import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { EppItem } from "@/types/hr";

export default async function NewRequestPage() {
  await requireUser(["EMPLEADO"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("epp_catalog").select("id, name, description").eq("active", true).order("name");
  if (error) throw new Error("No se pudo consultar el catálogo de ropa y EPP.");
  const catalog = (data ?? []) as EppItem[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" size="sm"><Link href="/portal/solicitudes"><ArrowLeft className="h-4 w-4" />Volver a mis solicitudes</Link></Button>
      <div><h1 className="text-2xl font-semibold">Nueva solicitud</h1><p className="mt-2 text-sm text-muted-foreground">Completá la información para que Recursos Humanos pueda revisarla.</p></div>
      <Card>
        <CardHeader><CardTitle>Detalle de la solicitud</CardTitle></CardHeader>
        <CardContent><NewRequestForm catalog={catalog} /></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Los períodos de vacaciones muestran días calendario estimados y no descuentan saldos.</p>
    </div>
  );
}
