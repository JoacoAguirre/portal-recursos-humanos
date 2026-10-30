"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Falta configurar Supabase. Revisá las variables de entorno.");
  }
  return createBrowserClient<Database>(url, key);
}
