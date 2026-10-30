"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { AppRole } from "@/types/database";

type RegistrationProfile = {
  first_name: string;
  last_name: string;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  employee_number: string | null;
  company_id: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  onboarding_completed_at: string | null;
};

type CompanyAccess = {
  company_id: string;
  can_manage_employees: boolean;
  can_manage_documents: boolean;
  can_resolve_requests: boolean;
};

const roleLabels: Record<AppRole, string> = {
  EMPLEADO: "Empleado",
  RRHH_ADMIN: "Administrador de RR. HH.",
  SUPERADMIN: "Superadministrador"
};

export function RegistrationForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<RegistrationProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [linkExpired, setLinkExpired] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function loadProfile() {
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (!active) return;
      if (sessionError || !user) {
        setLinkExpired(true);
        setLoadingProfile(false);
        return;
      }
      const [{ data: appRole, error: roleError }, { data: userProfile, error: profileError }] = await Promise.all([
        supabase.rpc("get_my_role"),
        supabase.from("profiles")
          .select("first_name, last_name, contact_email, phone, address, employee_number, company_id, department, position, hire_date, onboarding_completed_at")
          .eq("id", user.id)
          .maybeSingle()
      ]);
      if (!active) return;
      if (roleError || profileError || !appRole || !userProfile) {
        setError("No pudimos cargar el perfil asociado a esta invitación. Contactá a Recursos Humanos.");
        setLoadingProfile(false);
        return;
      }

      setRole(appRole);
      setProfile(userProfile);
      if (userProfile.onboarding_completed_at) {
        setOnboardingComplete(true);
        setLoadingProfile(false);
        return;
      }

      if (appRole === "RRHH_ADMIN") {
        const { data: accessRows, error: accessError } = await supabase
          .from("user_company_access")
          .select("company_id, can_manage_employees, can_manage_documents, can_resolve_requests");
        if (!active) return;
        if (accessError) {
          setError("No pudimos cargar las asignaciones de empresa. Contactá a Recursos Humanos.");
          setLoadingProfile(false);
          return;
        }
        const access = (accessRows ?? []) as CompanyAccess[];
        const { data: companies, error: companiesError } = access.length
          ? await supabase.from("companies").select("id, name").in("id", access.map((row) => row.company_id))
          : { data: [], error: null };
        if (!active) return;
        if (companiesError) {
          setError("No pudimos cargar las empresas asignadas. Contactá a Recursos Humanos.");
          setLoadingProfile(false);
          return;
        }
        const names = new Map((companies ?? []).map((company) => [company.id, company.name]));
        setCompanyNames(access.map((row) => {
          const permissions = [
            row.can_manage_employees && "empleados",
            row.can_manage_documents && "documentos",
            row.can_resolve_requests && "solicitudes"
          ].filter(Boolean).join(", ");
          return `${names.get(row.company_id) ?? "Empresa"} (${permissions || "sin permisos operativos"})`;
        }));
      } else if (userProfile.company_id) {
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("name")
          .eq("id", userProfile.company_id)
          .maybeSingle();
        if (!active) return;
        if (companyError) {
          setError("No pudimos cargar la empresa asignada. Contactá a Recursos Humanos.");
          setLoadingProfile(false);
          return;
        }
        setCompanyNames(company ? [company.name] : []);
      }
      setLoadingProfile(false);
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!profile || !role) return;
    if (password.length < 12 || password.length > 128) {
      setError("La contraseña debe tener entre 12 y 128 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) {
        setError("No se pudo establecer la contraseña. Verificá que el enlace siga vigente e intentá nuevamente.");
        return;
      }

      const result = await completeOnboardingAction({
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        contact_email: formData.get("contact_email"),
        phone: formData.get("phone"),
        address: formData.get("address")
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(role === "EMPLEADO" ? "/portal" : "/admin");
      router.refresh();
    } catch {
      setError("No se pudo completar el alta. Verificá tu conexión e intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingProfile) return <p role="status" className="mt-6 text-sm text-muted-foreground">Validando la invitación...</p>;
  if (linkExpired) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm text-amber-200">El enlace venció o ya fue utilizado. Solicitá uno nuevo a Recursos Humanos.</p>
        <a href="/recuperar-contrasena" className="text-sm text-blue-300 underline">Solicitar un enlace nuevo</a>
      </div>
    );
  }
  if (onboardingComplete) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border border-slate-700 p-4">
        <p className="text-sm text-muted-foreground">El alta de esta cuenta ya fue completada. Para actualizar tus datos, ingresá al portal o contactá a RR. HH.</p>
        <a href="/login" className="text-sm text-blue-300 underline">Ir al inicio de sesión</a>
      </div>
    );
  }
  if (!profile || !role) return <p role="alert" className="mt-6 text-sm text-red-300">{error || "No se pudo cargar el perfil."}</p>;

  return (
    <form onSubmit={submit} className="mt-7 space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-700 p-5">
        <h2 className="font-medium">Datos personales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="first_name" label="Nombre" defaultValue={profile.first_name} required />
          <Field name="last_name" label="Apellido" defaultValue={profile.last_name} required />
          <Field name="contact_email" label="Correo de contacto" defaultValue={profile.contact_email ?? ""} type="email" />
          <Field name="phone" label="Teléfono" defaultValue={profile.phone ?? ""} />
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="address" className="text-sm font-medium">Domicilio</label>
            <textarea id="address" name="address" defaultValue={profile.address ?? ""} maxLength={300} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 p-5">
        <h2 className="font-medium">Datos administrados por RR. HH.</h2>
        <ReadOnlyField label="Tipo de acceso" value={roleLabels[role]} />
        {role === "EMPLEADO" && <>
          <ReadOnlyField label="Legajo" value={profile.employee_number ?? "Pendiente de asignación"} />
          <ReadOnlyField label="Empresa" value={companyNames[0] ?? "Pendiente de asignación"} />
          <ReadOnlyField label="Sector" value={profile.department ?? "Pendiente de asignación"} />
          <ReadOnlyField label="Puesto" value={profile.position ?? "Pendiente de asignación"} />
          <ReadOnlyField label="Fecha de ingreso" value={profile.hire_date ?? "Pendiente de asignación"} />
        </>}
        {role === "RRHH_ADMIN" && <ReadOnlyField label="Empresas y permisos" value={companyNames.join("; ") || "Sin asignaciones"} />}
        {role === "SUPERADMIN" && <p className="text-sm text-muted-foreground">Los permisos de superadministración son administrados por el sistema.</p>}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-700 p-5">
        <h2 className="font-medium">Crear contraseña</h2>
        <Field name="password" label="Contraseña" type="password" autoComplete="new-password" value={password} onChange={setPassword} required />
        <Field name="confirm_password" label="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} required />
        <p className="text-xs text-muted-foreground">Usá entre 12 y 128 caracteres.</p>
      </section>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar y entrar"}</Button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  value,
  onChange,
  type = "text",
  autoComplete,
  required = false
}: {
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium">{label}{required && " *"}</label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        autoComplete={autoComplete}
        required={required}
        maxLength={name === "first_name" || name === "last_name" ? 100 : name === "phone" ? 40 : name === "contact_email" ? 254 : undefined}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
