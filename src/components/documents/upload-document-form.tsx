"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEmployeeDocumentAction } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DocumentEmployeeOption = { id: string; first_name: string; last_name: string; employee_number: string | null; company_name: string };

export function UploadDocumentForm({ employees }: { employees: DocumentEmployeeOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    setLoading(true);
    const result = await uploadEmployeeDocumentAction(new FormData(event.currentTarget));
    if (!result.ok) setMessage(result.error);
    else {
      setSuccess(true);
      event.currentTarget.reset();
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><label htmlFor="employee_id" className="text-sm font-medium">Empleado</label><select required name="employee_id" id="employee_id" className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Seleccioná un empleado</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name} · {employee.employee_number ?? "Sin legajo"} · {employee.company_name}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="document_type" className="text-sm font-medium">Tipo de documento</label><Input id="document_type" name="document_type" required maxLength={120} /></div>
        <div className="space-y-2"><label htmlFor="document_file" className="text-sm font-medium">Archivo (PDF, PNG o JPEG; máximo 10 MB)</label><Input id="document_file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required /></div>
        <div className="space-y-2"><label htmlFor="issue_date" className="text-sm font-medium">Fecha de emisión</label><Input id="issue_date" name="issue_date" type="date" /></div>
        <div className="space-y-2"><label htmlFor="expiration_date" className="text-sm font-medium">Fecha de vencimiento</label><Input id="expiration_date" name="expiration_date" type="date" /></div>
        <div className="flex items-center gap-2 sm:col-span-2"><input id="expiration_unknown" name="expiration_unknown" type="checkbox" value="true" className="h-4 w-4 accent-blue-500" /><label htmlFor="expiration_unknown" className="text-sm">Vencimiento desconocido</label><input type="hidden" name="expiration_unknown" value="false" /></div>
        <div className="space-y-2 sm:col-span-2"><label htmlFor="notes" className="text-sm font-medium">Observaciones</label><textarea id="notes" name="notes" maxLength={2000} className="min-h-20 w-full rounded-lg border bg-slate-900/60 px-3 py-2 text-sm" /></div>
      </div>
      {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
      {success && <p role="status" className="text-sm text-emerald-300">Documento privado cargado correctamente.</p>}
      <Button type="submit" disabled={loading || employees.length === 0}>{loading ? "Cargando archivo..." : "Cargar documento"}</Button>
    </form>
  );
}
