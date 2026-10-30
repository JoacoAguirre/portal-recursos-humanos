import { FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentDownloadButton } from "@/components/documents/document-download-button";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDate, todayInTimeZone } from "@/lib/utils";

export default async function MyDocumentsPage() {
  await requireUser(["EMPLEADO"]);
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from("employee_documents")
    .select("id, document_type, issue_date, expiration_date, expiration_unknown, notes")
    .eq("active", true)
    .order("expiration_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error("No se pudieron cargar tus documentos.");
  const today = todayInTimeZone();
  const nextMonth = addCalendarDays(today, 30);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Mis documentos</h1><p className="mt-2 text-sm text-muted-foreground">Documentación vinculada a tu legajo. Los archivos se entregan mediante acceso privado y temporal.</p></div>
      <Card>
        <CardHeader><CardTitle>Legajo digital</CardTitle></CardHeader>
        <CardContent>
          {!documents?.length ? (
            <div className="rounded-lg border border-dashed border-slate-700 px-5 py-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm font-medium">No hay documentos cargados</p><p className="mt-1 text-xs text-muted-foreground">Si necesitás consultar tu legajo, contactá a RR. HH.</p></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {documents.map((document) => {
                const status = !document.expiration_date
                  ? document.expiration_unknown ? "Vencimiento desconocido" : "Sin vencimiento"
                  : document.expiration_date < today ? "Vencido"
                    : document.expiration_date <= nextMonth ? "Próximo a vencer" : "Vigente";
                const tone = status === "Vencido" ? "danger" : status === "Próximo a vencer" || status === "Vencimiento desconocido" ? "warning" : "success";
                return (
                  <div key={document.id} className="flex items-start gap-3 rounded-xl border border-slate-700 p-4">
                    <span className="rounded-lg bg-blue-500/10 p-2 text-blue-300"><FileText className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{document.document_type}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Emisión: {formatDate(document.issue_date)} · Vencimiento: {document.expiration_unknown ? "Desconocido" : formatDate(document.expiration_date)}</p>
                      {document.notes && <p className="mt-2 text-sm text-slate-300">{document.notes}</p>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Badge tone={tone}>{status}</Badge><DocumentDownloadButton id={document.id} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
