"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(id: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, error: "Notificación no válida." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false as const, error: "Tu sesión venció." };
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "No se pudo actualizar la notificación." };
  revalidatePath("/portal/notificaciones");
  revalidatePath("/admin/notificaciones");
  return { ok: true as const };
}
