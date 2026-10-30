"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEppItemAction } from "@/app/actions/configuration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Company } from "@/types/database";

export function EppCatalogForm({
  companies,
  superadmin
}: {
  companies: Company[];
  superadmin: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(superadmin ? "" : companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const result = await createEppItemAction({ company_id: companyId || null, name, description });
    if (result.ok) {
      setName("");
      setDescription("");
      setMessage("Elemento agregado.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1.2fr_1.5fr_auto]">
      {superadmin && <div className="space-y-1.5"><label htmlFor="epp-company" className="text-xs text-muted-foreground">Empresa</label><select id="epp-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Catálogo global</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>}
      <div className="space-y-1.5"><label htmlFor="epp-name" className="text-xs text-muted-foreground">Elemento</label><Input id="epp-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></div>
      <div className="space-y-1.5"><label htmlFor="epp-description" className="text-xs text-muted-foreground">Descripción</label><Input id="epp-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></div>
      <div className="flex items-end"><Button type="submit" disabled={loading || (!companyId && !superadmin)}>{loading ? "Guardando..." : "Agregar"}</Button></div>
      {message && <p role="status" className="text-xs text-emerald-300 md:col-span-full">{message}</p>}
    </form>
  );
}
