"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthRedirectUrl } from "@/lib/auth/redirect-url";
import type { AppRole } from "@/types/database";

export type AdminUserActionResult = { ok: true } | { ok: false; error: string };

const inviteAdminSchema = z.object({
  email: z.string().trim().email().max(254),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  company_id: z.string().uuid(),
  can_manage_employees: z.boolean(),
  can_manage_documents: z.boolean(),
  can_resolve_requests: z.boolean()
});

type SuperadminClientResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User }
  | { ok: false; error: string };

async function getSuperadminClient(): Promise<SuperadminClientResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || role !== "SUPERADMIN") return { ok: false, error: "Solo SUPERADMIN puede gestionar usuarios." };
  return { ok: true, supabase, user };
}

export async function inviteHrAdminAction(input: unknown): Promise<AdminUserActionResult> {
  const parsed = inviteAdminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del administrador." };
  const auth = await getSuperadminClient();
  if (!auth.ok) return { ok: false, error: auth.error };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Falta configurar la clave de servidor para invitar usuarios." };
  }
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email.toLowerCase(),
    {
      data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
      redirectTo: getAuthRedirectUrl("/registro")
    }
  );
  if (inviteError || !invitation.user) {
    return { ok: false, error: "No se pudo enviar la invitación. Verificá el correo y la configuración de Auth." };
  }

  const { error } = await auth.supabase.rpc("provision_hr_admin", {
    p_user_id: invitation.user.id,
    p_company_id: parsed.data.company_id,
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_can_manage_employees: parsed.data.can_manage_employees,
    p_can_manage_documents: parsed.data.can_manage_documents,
    p_can_resolve_requests: parsed.data.can_resolve_requests
  });
  if (error) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError) {
      console.error("hr_admin_invitation_cleanup_failed");
      return { ok: false, error: "Falló el alta y no se pudo limpiar la invitación. Contactá al administrador del sistema." };
    }
    return { ok: false, error: "No se pudo asignar el rol y la empresa. La invitación fue cancelada." };
  }
  revalidatePath("/admin/configuracion");
  return { ok: true };
}

export async function resendUserSetupAction(userId: string): Promise<AdminUserActionResult> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "El usuario no es válido." };
  const auth = await getSuperadminClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (userId === auth.user.id) return { ok: false, error: "No podés reenviar un enlace a tu propia cuenta." };

  const { data: users, error: usersError } = await auth.supabase.rpc("list_managed_users");
  if (usersError) return { ok: false, error: "No se pudo validar el usuario." };
  const target = users?.find((managedUser) => managedUser.user_id === userId);
  if (!target) return { ok: false, error: "No se encontró el usuario administrado." };
  if (target.role === "SUPERADMIN") return { ok: false, error: "No se puede reabrir el alta de un SUPERADMIN." };

  const { error: reopenError } = await auth.supabase.rpc("reopen_user_onboarding", { p_user_id: userId });
  if (reopenError) return { ok: false, error: "No se pudo reabrir el alta del usuario." };

  const { error } = await auth.supabase.auth.resetPasswordForEmail(target.email, {
    redirectTo: getAuthRedirectUrl("/auth/callback?next=/registro")
  });
  if (error) {
    console.error("user_setup_email_failed", { code: error.code ?? "unknown", status: error.status ?? 0 });
    return {
      ok: false,
      error: error.code === "email_not_confirmed"
        ? "El alta quedó reabierta, pero la cuenta no confirmó el correo. Pedí a RR. HH. revisar la invitación."
        : error.status === 429
          ? "El alta quedó reabierta, pero Supabase limitó los correos. Esperá unos minutos antes de reintentar el envío."
          : "El alta quedó reabierta, pero no se pudo enviar el enlace. Verificá la URL permitida y la configuración de correo de Supabase."
    };
  }
  revalidatePath("/admin/configuracion");
  return { ok: true };
}

const accessSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  enabled: z.boolean(),
  can_manage_employees: z.boolean(),
  can_manage_documents: z.boolean(),
  can_resolve_requests: z.boolean()
});

export async function configureCompanyAccessAction(input: unknown): Promise<AdminUserActionResult> {
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "La configuración de acceso no es válida." };
  const auth = await getSuperadminClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await auth.supabase.rpc("configure_user_company_access", {
    p_user_id: parsed.data.user_id,
    p_company_id: parsed.data.company_id,
    p_enabled: parsed.data.enabled,
    p_can_manage_employees: parsed.data.can_manage_employees,
    p_can_manage_documents: parsed.data.can_manage_documents,
    p_can_resolve_requests: parsed.data.can_resolve_requests
  });
  if (error) return { ok: false, error: "No se pudo actualizar la asignación de empresa." };
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin");
  return { ok: true };
}

export async function configureRoleAction(userId: string, role: AppRole): Promise<AdminUserActionResult> {
  if (!z.string().uuid().safeParse(userId).success || !["EMPLEADO", "RRHH_ADMIN", "SUPERADMIN"].includes(role)) {
    return { ok: false, error: "El usuario o rol no es válido." };
  }
  const auth = await getSuperadminClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await auth.supabase.rpc("configure_user_role", { p_user_id: userId, p_role: role });
  if (error) return { ok: false, error: error.code === "42501" ? "No se puede modificar el propio rol." : "No se pudo modificar el rol. Revisá las reglas y el último SUPERADMIN." };
  revalidatePath("/admin/configuracion");
  return { ok: true };
}
