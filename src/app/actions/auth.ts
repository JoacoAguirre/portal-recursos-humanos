"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("No se pudo cerrar la sesión. Intentá nuevamente.");
  redirect("/login");
}
