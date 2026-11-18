"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { jobVacancySchema, updateJobVacancySchema } from "@/lib/validations/applications";

type VacancyActionResult = { ok: true } | { ok: false; error: string };
type HrContext =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string };

async function getHrContext(): Promise<HrContext> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para administrar vacantes." };
  }
  return { ok: true, supabase };
}

async function validateActiveCompany(companyId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("companies").select("id").eq("id", companyId).eq("active", true).maybeSingle();
    if (error) {
      console.error("job_vacancy_company_lookup_failed", error.code);
      return "No se pudo validar la empresa seleccionada.";
    }
    return data ? null : "La empresa seleccionada no está disponible.";
  } catch {
    console.error("job_vacancy_company_lookup_unavailable");
    return "No se pudo validar la empresa seleccionada.";
  }
}

function refreshVacancyPages() {
  revalidatePath("/admin/vacantes");
  revalidatePath("/admin/postulantes");
}

export async function createJobVacancyAction(input: unknown): Promise<VacancyActionResult> {
  const parsed = jobVacancySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ingresá una empresa y un nombre de puesto válidos." };
  const auth = await getHrContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const companyError = await validateActiveCompany(parsed.data.company_id);
  if (companyError) return { ok: false, error: companyError };
  const { error } = await auth.supabase.from("job_vacancies").insert({
    company_id: parsed.data.company_id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    active: true
  });
  if (error) {
    console.error("job_vacancy_create_failed", error.code);
    return { ok: false, error: "No se pudo crear la vacante." };
  }
  refreshVacancyPages();
  return { ok: true };
}

export async function updateJobVacancyAction(input: unknown): Promise<VacancyActionResult> {
  const parsed = updateJobVacancySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos de la vacante." };
  const auth = await getHrContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  let companyError = await validateActiveCompany(parsed.data.company_id);
  if (companyError === "La empresa seleccionada no está disponible.") {
    const { data: current, error } = await auth.supabase
      .from("job_vacancies")
      .select("company_id")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (error) {
      console.error("job_vacancy_company_check_failed", error.code);
      return { ok: false, error: "No se pudo validar la empresa seleccionada." };
    }
    if (current?.company_id === parsed.data.company_id) companyError = null;
  }
  if (companyError) return { ok: false, error: companyError };
  const { data, error } = await auth.supabase
    .from("job_vacancies")
    .update({
      company_id: parsed.data.company_id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("job_vacancy_update_failed", error?.code ?? "not_found");
    return { ok: false, error: "No se pudo actualizar la vacante." };
  }
  refreshVacancyPages();
  return { ok: true };
}

export async function setJobVacancyActiveAction(input: unknown): Promise<VacancyActionResult> {
  const parsed = z.object({ id: z.string().uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "La vacante indicada no es válida." };
  const auth = await getHrContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase
    .from("job_vacancies")
    .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("job_vacancy_status_update_failed", error?.code ?? "not_found");
    return { ok: false, error: "No se pudo cambiar el estado de la vacante." };
  }
  refreshVacancyPages();
  return { ok: true };
}

export async function deleteJobVacancyAction(id: string): Promise<VacancyActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "La vacante indicada no es válida." };
  const auth = await getHrContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.from("job_vacancies").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    console.error("job_vacancy_delete_failed", error?.code ?? "not_found");
    return {
      ok: false,
      error: error?.code === "23503"
        ? "No se puede eliminar porque ya tiene postulaciones asociadas. Desactivala para conservar el historial."
        : "No se pudo eliminar la vacante."
    };
  }
  refreshVacancyPages();
  return { ok: true };
}
