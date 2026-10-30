"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { configureCompanyAccessAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Company } from "@/types/database";

export function CompanyAccessForm({
  userId,
  companies,
  assigned
}: {
  userId: string;
  companies: Company[];
  assigned: { company_id: string; can_manage_employees: boolean; can_manage_documents: boolean; can_resolve_requests: boolean }[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
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
    const result = await configureCompanyAccessAction({
      user_id: userId,
      company_id: companyId,
      enabled,
      can_manage_employees: employeeAccess,
      can_manage_documents: documentAccess,
      can_resolve_requests: requestAccess
    });
    if (result.ok) {
      setMessage(enabled ? "Permisos guardados." : "Acceso revocado.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor={`company-access-${userId}`}>Empresa de acceso</label>
      <select id={`company-access-${userId}`} value={companyId} onChange={(event) => chooseCompany(event.target.value)} className="h-9 w-full rounded-lg border bg-slate-900 px-2 text-xs">
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <label className="flex gap-2"><input type="checkbox" checked={employeeAccess} onChange={(event) => setEmployeeAccess(event.target.checked)} />Empleados</label>
        <label className="flex gap-2"><input type="checkbox" checked={documentAccess} onChange={(event) => setDocumentAccess(event.target.checked)} />Documentos</label>
        <label className="flex gap-2"><input type="checkbox" checked={requestAccess} onChange={(event) => setRequestAccess(event.target.checked)} />Solicitudes</label>
      </div>
      <p className="text-xs text-muted-foreground">{current ? "Asignación actual" : "Sin asignación"}</p>
      {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => save(true)} disabled={loading || !companyId}>Guardar acceso</Button>
        {current && <Button type="button" size="sm" variant="secondary" onClick={() => save(false)} disabled={loading}>Revocar</Button>}
      </div>
    </div>
  );
}
