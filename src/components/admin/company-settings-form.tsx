"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompanyAction } from "@/app/actions/configuration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Company } from "@/types/database";

export function CompanySettingsForm({ company }: { company: Company }) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [active, setActive] = useState(company.active);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setMessage("");
    const result = await updateCompanyAction({ id: company.id, name, active });
    if (result.ok) {
      setMessage("Empresa actualizada.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto_auto] sm:items-end">
    <div><label className="mb-1.5 block text-xs text-muted-foreground">Código</label><Input value={company.code} disabled /></div>
    <div><label htmlFor={`company-${company.id}`} className="mb-1.5 block text-xs text-muted-foreground">Nombre</label><Input id={`company-${company.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></div>
    <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Activa</label>
    <Button type="button" size="sm" onClick={save} disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
    {message && <p role="status" className="text-xs text-emerald-300 sm:col-span-full">{message}</p>}
  </div>;
}
