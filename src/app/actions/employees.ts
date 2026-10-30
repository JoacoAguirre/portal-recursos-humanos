"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthRedirectUrl } from "@/lib/auth/redirect-url";
import {
  employeeImportRowSchema,
  findEmployeeImportDuplicateErrors
} from "@/lib/validations/employees";

const employeeInvitationSchema = z.object({
  email: z.string().trim().email().max(254),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  employee_number: z.string().trim().min(1).max(60),
  company_id: z.string().uuid(),
  department: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  hire_date: z.string().date().optional().or(z.literal(""))
});

export type EmployeeActionResult = { ok: true } | { ok: false; error: string };

type EmployeeInvitation = z.infer<typeof employeeInvitationSchema>;

type EmployeeManagerResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User; role: "RRHH_ADMIN" | "SUPERADMIN" }
  | { ok: false; error: string };

async function authorizeEmployeeManager(): Promise<EmployeeManagerResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para administrar empleados." };
  }
  return { ok: true, supabase, user, role };
}

async function inviteEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  employee: EmployeeInvitation
): Promise<EmployeeActionResult> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("id", employee.company_id)
    .eq("active", true)
    .maybeSingle();
  if (companyError || !company) return { ok: false, error: "No tenés permiso para invitar empleados a esa empresa." };

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    employee.email.toLowerCase(),
    {
      data: { first_name: employee.first_name, last_name: employee.last_name },
      redirectTo: getAuthRedirectUrl("/registro")
    }
  );
  if (inviteError || !invitation.user) {
    return { ok: false, error: "No se pudo enviar la invitación. Verificá el correo y la configuración de Auth." };
  }

  const { error: profileError } = await supabase.rpc("create_employee_profile", {
    p_user_id: invitation.user.id,
    p_company_id: employee.company_id,
    p_first_name: employee.first_name,
    p_last_name: employee.last_name,
    p_employee_number: employee.employee_number,
    p_department: employee.department ?? null,
    p_position: employee.position ?? null,
    p_phone: employee.phone ?? null,
    p_address: employee.address ?? null,
    p_hire_date: employee.hire_date || null
  });

  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError) {
      console.error("employee_invitation_cleanup_failed");
      return { ok: false, error: "No se pudo completar el alta ni limpiar la invitación. Contactá al administrador del sistema." };
    }
    return {
      ok: false,
      error: profileError.code === "42501"
        ? "No tenés permiso para administrar empleados en esa empresa."
        : profileError.code === "23505"
          ? "El legajo ya existe."
          : "No se pudo crear el perfil del empleado."
    };
  }
  return { ok: true };
}

export async function inviteEmployeeAction(input: unknown): Promise<EmployeeActionResult> {
  const parsed = employeeInvitationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del empleado." };
  const auth = await authorizeEmployeeManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "El servicio de invitaciones no está configurado en el servidor." };
  }

  const result = await inviteEmployee(auth.supabase, admin, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/empleados");
  return { ok: true };
}

const employeeImportSchema = z.array(z.object({
  line: z.number().int().min(2),
  employee: employeeImportRowSchema
})).min(1).max(100);

export type EmployeeImportActionResult =
  | { ok: true; rows: { line: number; success: boolean; message: string }[] }
  | { ok: false; error: string };

export async function importEmployeesAction(input: unknown): Promise<EmployeeImportActionResult> {
  const parsed = employeeImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "El archivo debe tener entre 1 y 100 filas válidas." };
  const auth = await authorizeEmployeeManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const [{ data: companies, error: companiesError }, { data: accessRows, error: accessError }] = await Promise.all([
    auth.supabase.from("companies").select("id, code").eq("active", true),
    auth.supabase.from("user_company_access").select("company_id, can_manage_employees").eq("user_id", auth.user.id)
  ]);
  if (companiesError || accessError) {
    return { ok: false, error: "No se pudieron validar las empresas habilitadas para la importación." };
  }

  const allowedCompanyIds = new Set(
    auth.role === "SUPERADMIN"
      ? (companies ?? []).map((company) => company.id)
      : (accessRows ?? []).filter((row) => row.can_manage_employees).map((row) => row.company_id)
  );
  const companyIdByCode = new Map((companies ?? []).map((company) => [company.code.toUpperCase(), company.id]));
  const rows = parsed.data.map(({ line, employee }) => {
    const companyId = companyIdByCode.get(employee.company_code);
    if (!companyId || !allowedCompanyIds.has(companyId)) {
      return { line, employee, companyId: null, success: false, message: "No tenés permiso para administrar esa empresa." };
    }
    return { line, employee, companyId, success: false, message: "" };
  });

  const duplicateErrors = findEmployeeImportDuplicateErrors(
    rows.flatMap((row) => row.companyId ? [{ line: row.line, data: row.employee }] : [])
  );
  for (const row of rows) {
    const duplicateError = duplicateErrors.get(row.line);
    if (duplicateError) row.message = duplicateError;
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "El servicio de invitaciones no está configurado en el servidor." };
  }

  for (const row of rows) {
    if (!row.companyId || row.message) continue;
    const result = await inviteEmployee(auth.supabase, admin, {
      ...row.employee,
      company_id: row.companyId
    });
    row.success = result.ok;
    row.message = result.ok ? "Invitación enviada y legajo creado." : result.error;
  }

  revalidatePath("/admin/empleados");
  revalidatePath("/admin");
  return {
    ok: true,
    rows: rows.map(({ line, success, message }) => ({ line, success, message }))
  };
}

export async function updateEmployeeStatusAction(
  employeeId: string,
  active: boolean
): Promise<EmployeeActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return { ok: false, error: "Empleado no válido." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para actualizar empleados." };
  }
  const { data: employee, error: employeeError } = await supabase.from("profiles").select("company_id").eq("id", employeeId).maybeSingle();
  if (employeeError || !employee?.company_id) return { ok: false, error: "Empleado no encontrado." };
  const { data, error } = await supabase
    .from("profiles")
    .update({ employment_status: active ? "active" : "inactive" })
    .eq("id", employeeId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se pudo actualizar el estado del empleado." };
  revalidatePath("/admin/empleados");
  revalidatePath("/admin");
  return { ok: true };
}

const employeeUpdateSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  employee_number: z.string().trim().min(1).max(60),
  department: z.string().trim().max(120),
  position: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
  hire_date: z.string().date().optional().or(z.literal(""))
});

export async function updateEmployeeProfileAction(input: unknown): Promise<EmployeeActionResult> {
  const parsed = employeeUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del legajo." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para editar legajos." };
  }
  const { data: current, error: currentError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (currentError || !current?.company_id) return { ok: false, error: "Empleado no disponible." };
  const { data, error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      employee_number: parsed.data.employee_number,
      department: parsed.data.department || null,
      position: parsed.data.position || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      hire_date: parsed.data.hire_date || null
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "Ese legajo ya existe." : "No tenés permiso para editar este legajo." };
  revalidatePath("/admin/empleados");
  revalidatePath(`/admin/empleados/${parsed.data.id}`);
  return { ok: true };
}
