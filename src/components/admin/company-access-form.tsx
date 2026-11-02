"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { configureCompanyAccessAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Company } from "@/types/database";

export function CompanyAccessForm({
  userId,
  companies,
  assigned,
  readOnlyOnly = false
}: {
  userId: string;
  companies: Company[];
  assigned: { company_id: string; can_manage_employees: boolean; can_manage_documents: boolean; can_resolve_requests: boolean }[];
  readOnlyOnly?: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(assigned[0]?.company_id ?? companies[0]?.id ?? "");
  const current = assigned.find((item) => item.company_id === companyId);
  const [employeeAccess, setEmployeeAccess] = useState(current?.can_manage_employees ?? false);
  const [documentAccess, setDocumentAccess] = useState(current?.can_manage_documents ?? false);
  const [requestAccess, setRequestAccess] = useState(current?.can_resolve_requests ?? true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function chooseCompany(value: string) {
    setCompanyId(value);
    const access = assigned.find((item) => item.company_id === value);
    setEmployeeAccess(access?.can_manage_employees ?? false);
    setDocumentAccess(access?.can_manage_documents ?? false);
    setRequestAccess(access?.can_resolve_requests ?? true);
  }

  async function save(enabled: boolean) {
    setLoading(true);
    setMessage("");
    try {
      const result = await configureCompanyAccessAction({
        user_id: userId,
        company_id: companyId,
        enabled,
        can_manage_employees: readOnlyOnly ? false : employeeAccess,
        can_manage_documents: readOnlyOnly ? false : documentAccess,
        can_resolve_requests: readOnlyOnly ? false : requestAccess
      });
      if (result.ok) {
        setMessage(enabled ? "Empresa y permisos actualizados." : "Acceso revocado.");
        router.refresh();
      } else setMessage(result.error);
    } catch {
      setMessage("No se pudo guardar el acceso. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const assignedNames = assigned
    .map((item) => companies.find((company) => company.id === item.company_id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor={`company-access-${userId}`}>Empresa de acceso</label>
      <select id={`company-access-${userId}`} value={companyId} onChange={(event) => chooseCompany(event.target.value)} className="h-9 w-full rounded-lg border bg-slate-900 px-2 text-xs">
        {!companies.length && <option value="">No hay empresas disponibles</option>}
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      {readOnlyOnly ? <p className="text-xs text-muted-foreground">Acceso de consulta, sin permisos para modificar información.</p> : <div className="grid gap-2 text-xs sm:grid-cols-3">
        <label className="flex gap-2"><input type="checkbox" checked={employeeAccess} onChange={(event) => setEmployeeAccess(event.target.checked)} />Empleados</label>
        <label className="flex gap-2"><input type="checkbox" checked={documentAccess} onChange={(event) => setDocumentAccess(event.target.checked)} />Documentos</label>
        <label className="flex gap-2"><input type="checkbox" checked={requestAccess} onChange={(event) => setRequestAccess(event.target.checked)} />Solicitudes</label>
      </div>}
      <p className="text-xs text-muted-foreground">{assignedNames.length ? `Empresa actual: ${assignedNames.join(", ")}` : "Sin empresa asignada. Al guardar, quedará asignada la empresa seleccionada."}</p>
      {message && <p role={message.includes("No se pudo") ? "alert" : "status"} className={`text-xs ${message.includes("No se pudo") ? "text-red-300" : "text-emerald-300"}`}>{message}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => save(true)} disabled={loading || !companyId}>{loading ? "Guardando..." : "Guardar empresa"}</Button>
        {current && <Button type="button" size="sm" variant="secondary" onClick={() => save(false)} disabled={loading}>Revocar acceso</Button>}
      </div>
    </div>
  );
}
