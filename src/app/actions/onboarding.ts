"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onboardingProfileSchema } from "@/lib/validations/onboarding";

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(input: unknown): Promise<OnboardingActionResult> {
  const parsed = onboardingProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos personales." };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "El enlace venció. Solicitá uno nuevo para continuar." };

  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || !role) return { ok: false, error: "La cuenta todavía no tiene un rol habilitado." };

  const { error } = await supabase.rpc("complete_my_profile", {
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_contact_email: parsed.data.contact_email || null,
    p_phone: parsed.data.phone || null,
    p_address: parsed.data.address || null
  });
  if (error) {
    console.error("profile_onboarding_failed", error.code);
    return {
      ok: false,
      error: error.code === "42501"
        ? "El alta ya fue completada o no está habilitada para esta cuenta."
        : "No se pudieron guardar tus datos. Intentá nuevamente."
    };
  }

  revalidatePath("/admin/empleados");
  revalidatePath("/admin/configuracion");
  revalidatePath("/portal");
  revalidatePath("/portal/perfil");
  return { ok: true };
}
