"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewEmployeeRegistrationAction } from "@/app/actions/registrations";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import type { Company, Profile } from "@/types/database";

type Registration = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  dni: string;
  company_id: string | null;
  created_at: string;
};

type ExistingProfile = Pick<Profile, "id" | "company_id" | "employee_number" | "hire_date"> & {
  full_name: string;
  company_name: string;
};

export function EmployeeRegistrationReviewForm({
  registration,
  companies,
  matchingProfiles
}: {
  registration: Registration;
  companies: Company[];
  matchingProfiles: ExistingProfile[];
}) {
  const router = useRouter();
  const [existingProfileId, setExistingProfileId] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(form: HTMLFormElement, approve: boolean) {
    setMessage("");
    setSuccess(false);
    setLoading(true);
    try {
      const formData = new FormData(form);
      const existing = matchingProfiles.find((profile) => profile.id === existingProfileId);
      const result = await reviewEmployeeRegistrationAction({
        registration_id: registration.id,
        approve,
        existing_profile_id: existing?.id || undefined,
        company_id: existing?.company_id || formData.get("company_id") || undefined,
        employee_number: existing?.employee_number || formData.get("employee_number") || undefined,
        hire_date: existing?.hire_date || formData.get("hire_date") || undefined,
        department: formData.get("department") || undefined,
        position: formData.get("position") || undefined
      });
      setMessage(result.ok ? result.message ?? "Registro procesado." : result.error);
      setSuccess(result.ok);
      if (result.ok) router.refresh();
    } catch {
      setMessage("No se pudo procesar el registro. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void submit(event.currentTarget, true);
    }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor={`existing-${registration.id}`} className="text-xs text-muted-foreground">Vincular con un legajo existente (opcional)</label>
          <select
            id={`existing-${registration.id}`}
            value={existingProfileId}
            onChange={(event) => setExistingProfileId(event.target.value)}
            className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"
          >
            <option value="">Crear un legajo nuevo al aprobar</option>
            {matchingProfiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.full_name} · {profile.employee_number ?? "Sin legajo"} · {profile.company_name}
              </option>
            ))}
          </select>
          {!matchingProfiles.length && <p className="text-xs text-muted-foreground">No hay un legajo visible con este DNI.</p>}
        </div>
        {!existingProfileId && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor={`company-${registration.id}`} className="text-xs text-muted-foreground">Empresa</label>
              <select id={`company-${registration.id}`} name="company_id" defaultValue={registration.company_id ?? ""} required className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
                <option value="">Seleccioná una empresa</option>
                {companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
              </select>
            </div>
            <Field id={`number-${registration.id}`} name="employee_number" label="Número de legajo" required />
            <Field id={`hire-${registration.id}`} name="hire_date" label="Fecha de ingreso" type="date" required />
            <Field id={`department-${registration.id}`} name="department" label="Sector" />
            <Field id={`position-${registration.id}`} name="position" label="Puesto" />
          </>
        )}
      </div>
      {message && <p role={success ? "status" : "alert"} className={success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={loading || (!existingProfileId && !companies.length)}>{loading ? "Procesando..." : "Aprobar registro"}</Button>
        <Button type="button" variant="secondary" disabled={loading} onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) void submit(form, false);
        }}>Rechazar</Button>
      </div>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return <div className="space-y-1.5"><label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>{type === "date" ? <DateInput id={id} name={name} required={required} /> : <Input id={id} name={name} type={type} required={required} />}</div>;
}
