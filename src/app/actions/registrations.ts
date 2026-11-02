"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RegistrationActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const registrationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  dni: z.string().trim().regex(/^[0-9]{7,8}$/),
  company_id: z.string().uuid(),
  password: z.string().min(8).max(128)
});

export async function registerEmployeeAction(input: unknown): Promise<RegistrationActionResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá el correo, los datos personales, la empresa y la contraseña." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "El registro no está disponible en este momento." };
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("id", parsed.data.company_id)
    .eq("active", true)
    .maybeSingle();
  if (companyError) {
    console.error("employee_registration_company_lookup_failed", companyError.code ?? "unknown");
    return { ok: false, error: "No se pudo validar la empresa seleccionada." };
  }
  if (!company) return { ok: false, error: "La empresa seleccionada no está disponible." };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name
    }
  });
  if (createError || !created.user) {
    return {
      ok: false,
      error: createError?.code === "email_exists" || createError?.code === "user_already_exists"
        ? "Ya existe una cuenta con ese correo. Iniciá sesión o contactá a RR. HH."
        : "No se pudo crear la cuenta. Revisá los datos e intentá nuevamente."
    };
  }

  const { error: requestError } = await admin.from("employee_registration_requests").insert({
    auth_user_id: created.user.id,
    email: parsed.data.email,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    dni: parsed.data.dni,
    company_id: parsed.data.company_id
  });
  if (requestError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("employee_registration_cleanup_failed", cleanupError.code ?? "unknown");
      return { ok: false, error: "No se pudo registrar la solicitud ni limpiar la cuenta. Contactá a Recursos Humanos." };
    }
    return {
      ok: false,
      error: requestError.code === "23505"
        ? "Ya hay una solicitud pendiente con ese correo o DNI."
        : "No se pudo guardar la solicitud. Intentá nuevamente."
    };
  }

  return {
    ok: true,
    message: "Tu cuenta fue creada y quedó pendiente de aprobación por Recursos Humanos. Vas a poder ingresar cuando se apruebe."
  };
}

const registrationReviewSchema = z.object({
  registration_id: z.string().uuid(),
  approve: z.boolean(),
  company_id: z.string().uuid().optional(),
  employee_number: z.string().trim().min(1).max(60).optional(),
  hire_date: z.string().date().optional(),
  existing_profile_id: z.string().uuid().optional(),
  department: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional()
});

export async function reviewEmployeeRegistrationAction(input: unknown): Promise<RegistrationActionResult> {
  const parsed = registrationReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del legajo y la empresa." };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para aprobar registros." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "No se pudo conectar con el servicio de registros." };
  }
  const { data: registration, error: registrationError } = await admin
    .from("employee_registration_requests")
    .select("id, auth_user_id, status")
    .eq("id", parsed.data.registration_id)
    .eq("status", "pending")
    .maybeSingle();
  if (registrationError || !registration) return { ok: false, error: "El registro ya fue procesado o no está disponible." };

  const { data, error } = await supabase.rpc("review_employee_registration", {
    p_registration_id: parsed.data.registration_id,
    p_approve: parsed.data.approve,
    p_company_id: parsed.data.company_id ?? null,
    p_employee_number: parsed.data.employee_number ?? null,
    p_hire_date: parsed.data.hire_date ?? null,
    p_existing_profile_id: parsed.data.existing_profile_id ?? null,
    p_department: parsed.data.department ?? null,
    p_position: parsed.data.position ?? null
  });
  if (error || !data) {
    console.error("employee_registration_review_failed", error?.code ?? "unknown");
    return {
      ok: false,
      error: error?.code === "23505"
        ? "El DNI, el correo o el legajo ya están asociados a otra cuenta."
        : error?.code === "42501"
          ? "No tenés acceso a la empresa o al legajo seleccionado."
          : "No se pudo aplicar la decisión. Revisá los datos del legajo."
    };
  }

  const authUserToRemove = parsed.data.approve
    ? parsed.data.existing_profile_id
    : registration.auth_user_id;
  let warning: string | undefined;
  if (authUserToRemove) {
    const { error: removeError } = await admin.auth.admin.deleteUser(authUserToRemove);
    if (removeError) {
      console.error("employee_registration_old_account_cleanup_failed", removeError.code ?? "unknown");
      warning = "La solicitud se procesó, pero no se pudo retirar una cuenta anterior sin acceso. Contactá al administrador.";
    }
  }

  revalidatePath("/admin/registros");
  revalidatePath("/admin/empleados");
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {
    ok: true,
    message: warning ?? (parsed.data.approve ? "Registro aprobado." : "Registro rechazado.")
  };
}
