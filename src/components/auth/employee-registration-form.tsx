"use client";

import { useState } from "react";
import { registerEmployeeAction } from "@/app/actions/registrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Company } from "@/types/database";

export function EmployeeRegistrationForm({ companies }: { companies: Pick<Company, "id" | "name">[] }) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    setLoading(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const result = await registerEmployeeAction({
        email: formData.get("email"),
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        dni: formData.get("dni"),
        company_id: formData.get("company_id"),
        password: formData.get("password")
      });
      setMessage(result.ok ? result.message ?? "Solicitud enviada." : result.error);
      if (result.ok) {
        setSuccess(true);
        form.reset();
      }
    } catch {
      setMessage("No se pudo enviar la solicitud. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="first_name" label="Nombre" autoComplete="given-name" />
        <Field name="last_name" label="Apellido" autoComplete="family-name" />
        <Field name="email" label="Correo electrónico" type="email" autoComplete="email" />
        <Field name="dni" label="DNI (solo números)" inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} />
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="company_id" className="text-sm font-medium">Empresa</label>
          <select id="company_id" name="company_id" required disabled={!companies.length} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Seleccioná una empresa</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          {!companies.length && <p className="text-xs text-amber-300">No hay empresas disponibles para registrarse en este momento.</p>}
        </div>
        <div className="sm:col-span-2">
          <Field name="password" label="Contraseña (mínimo 8 caracteres)" type="password" autoComplete="new-password" minLength={8} maxLength={128} />
        </div>
      </div>
      {message && <p role={success ? "status" : "alert"} className={success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
      {success ? (
        <Button asChild className="w-full"><a href="/login">Ir a iniciar sesión</a></Button>
      ) : (
        <Button type="submit" className="w-full" disabled={loading || !companies.length}>{loading ? "Enviando..." : "Solicitar registro"}</Button>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  ...props
}: {
  name: string;
  label: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input id={name} name={name} type={type} required {...props} />
    </div>
  );
}
