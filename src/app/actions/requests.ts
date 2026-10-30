"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  requestResolutionSchema,
  requestSubmissionSchema,
  validateRequestPayload
} from "@/lib/validations/requests";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

type AuthenticatedClientResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User }
  | { ok: false; error: string };

async function authenticatedClient(): Promise<AuthenticatedClientResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  return { ok: true, supabase, user };
}

export async function createRequestAction(input: unknown): Promise<ActionResult> {
  const parsed = requestSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del formulario." };
  const payloadResult = validateRequestPayload(parsed.data.request_type, parsed.data.payload);
  if (!payloadResult.success) {
    return { ok: false, error: payloadResult.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  try {
    const auth = await authenticatedClient();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user } = auth;
    const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.rpc("get_my_role"),
      supabase.from("profiles").select("company_id, employment_status").eq("id", user.id).maybeSingle()
    ]);
    if (roleError || profileError) return { ok: false, error: "No se pudo validar tu acceso." };
    if (role !== "EMPLEADO" || !profile || profile.employment_status === "inactive" || !profile.company_id) {
      return { ok: false, error: "Tu cuenta no tiene permiso para crear solicitudes." };
    }

    const { data, error } = await supabase
      .from("requests")
      .insert({
        employee_id: user.id,
        company_id: profile.company_id,
        request_type: parsed.data.request_type,
        payload: payloadResult.data
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("create_request_failed", error?.code ?? "unknown");
      return { ok: false, error: "No se pudo guardar la solicitud. Revisá tu conexión e intentá nuevamente." };
    }
    revalidatePath("/portal");
    revalidatePath("/portal/solicitudes");
    return { ok: true, id: data.id };
  } catch {
    console.error("create_request_unavailable");
    return { ok: false, error: "El servicio de solicitudes no está disponible." };
  }
}

export async function resolveRequestAction(input: unknown): Promise<ActionResult> {
  const parsed = requestResolutionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "La resolución ingresada no es válida." };
  if (parsed.data.new_status === "rejected" && !parsed.data.comment?.trim()) {
    return { ok: false, error: "El motivo del rechazo es obligatorio." };
  }
  if (parsed.data.new_status === "observed" && !parsed.data.comment?.trim()) {
    return { ok: false, error: "El comentario de observación es obligatorio." };
  }

  try {
    const auth = await authenticatedClient();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase } = auth;
    const { data: role, error: roleError } = await supabase.rpc("get_my_role");
    if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
      return { ok: false, error: "No tenés permisos para gestionar solicitudes." };
    }

    const { data, error } = await supabase.rpc("resolve_request", {
      p_request_id: parsed.data.request_id,
      p_expected_version: parsed.data.expected_version,
      p_new_status: parsed.data.new_status,
      p_comment: parsed.data.comment ?? null,
      p_internal_note: parsed.data.internal_note ?? null
    });
    if (error || !data) {
      const code = error?.code;
      const message =
        code === "40001"
          ? "Otro administrador actualizó esta solicitud. Actualizá la página."
          : code === "42501"
            ? "No tenés acceso a la empresa de esta solicitud."
            : "No se pudo resolver la solicitud.";
      return { ok: false, error: message };
    }
    revalidatePath("/admin");
    revalidatePath("/admin/solicitudes");
    revalidatePath("/portal");
    revalidatePath("/portal/solicitudes");
    return { ok: true };
  } catch {
    return { ok: false, error: "El servicio de solicitudes no está disponible." };
  }
}

export async function cancelRequestAction(requestId: string, version: number): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "La solicitud no es válida." };
  }
  const auth = await authenticatedClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.rpc("cancel_own_request", {
    p_request_id: requestId,
    p_expected_version: version
  });
  if (error || !data) return { ok: false, error: "No se pudo cancelar. La solicitud puede haber cambiado." };
  revalidatePath("/portal");
  revalidatePath("/portal/solicitudes");
  return { ok: true };
}

export async function submitPersonalDataChangeAction(input: unknown): Promise<ActionResult> {
  const validated = validateRequestPayload("personal_data", input);
  if (!validated.success) return { ok: false, error: validated.error.issues[0]?.message ?? "Datos no válidos." };
  const auth = await authenticatedClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    auth.supabase.rpc("get_my_role"),
    auth.supabase.from("profiles").select("company_id, employment_status").eq("id", auth.user.id).maybeSingle()
  ]);
  if (
    roleError || profileError || role !== "EMPLEADO" || !profile ||
    profile.employment_status === "inactive" || !profile.company_id
  ) {
    return { ok: false, error: "No se pudo validar tu acceso." };
  }
  const requestedData = Object.fromEntries(
    Object.entries(validated.data).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  );

  const { data, error } = await auth.supabase
    .from("personal_data_change_requests")
    .insert({
      employee_id: auth.user.id,
      company_id: profile.company_id,
      requested_data: requestedData
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "No se pudo enviar la solicitud de actualización." };
  revalidatePath("/portal/perfil");
  return { ok: true, id: data.id };
}

export async function resolvePersonalDataChangeAction(
  changeId: string,
  approve: boolean,
  comment?: string
): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(changeId) || (typeof comment === "string" && comment.length > 4000)) {
    return { ok: false, error: "La resolución no es válida." };
  }
  const auth = await authenticatedClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: role, error: roleError } = await auth.supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para revisar esta solicitud." };
  }
  const { data, error } = await auth.supabase.rpc("review_personal_data_change", {
    p_change_id: changeId,
    p_approve: approve,
    p_comment: comment ?? null
  });
  if (error || !data) return { ok: false, error: "No se pudo aplicar la decisión." };
  revalidatePath("/admin/solicitudes");
  revalidatePath("/portal/perfil");
  return { ok: true };
}
