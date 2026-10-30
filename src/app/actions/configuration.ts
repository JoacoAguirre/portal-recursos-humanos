"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

type AdminContext =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; role: "RRHH_ADMIN" | "SUPERADMIN" }
  | { ok: false; error: string };

async function getAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para administrar la configuración." };
  }
  return { ok: true, supabase, role };
}

export async function createEppItemAction(input: unknown): Promise<Result> {
  const schema = z.object({
    company_id: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional()
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ingresá un nombre válido para el elemento." };
  const auth = await getAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!parsed.data.company_id && auth.role !== "SUPERADMIN") {
    return { ok: false, error: "Solo SUPERADMIN puede editar el catálogo global." };
  }
  const { error } = await auth.supabase.from("epp_catalog").insert({
    company_id: parsed.data.company_id,
    name: parsed.data.name,
    description: parsed.data.description || null
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe ese elemento en el catálogo." : "No se pudo agregar el elemento." };
  revalidatePath("/admin/configuracion");
  revalidatePath("/portal/solicitudes/nueva");
  return { ok: true };
}

export async function deactivateEppItemAction(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Elemento no válido." };
  const auth = await getAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase
    .from("epp_catalog")
    .update({ active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se pudo desactivar el elemento." };
  revalidatePath("/admin/configuracion");
  revalidatePath("/portal/solicitudes/nueva");
  return { ok: true };
}

export async function updateCompanyAction(input: unknown): Promise<Result> {
  const parsed = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    active: z.boolean()
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Los datos de la empresa no son válidos." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || role !== "SUPERADMIN") return { ok: false, error: "Solo SUPERADMIN puede modificar empresas." };
  const { data, error } = await supabase
    .from("companies")
    .update({ name: parsed.data.name, active: parsed.data.active })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se pudo actualizar la empresa." };
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin");
  return { ok: true };
}
