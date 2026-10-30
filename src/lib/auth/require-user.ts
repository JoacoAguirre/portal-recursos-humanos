import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppRole, Profile } from "@/types/database";

export type AuthenticatedUser = {
  id: string;
  email: string | undefined;
  role: AppRole;
  profile: Profile;
  companyName: string | null;
};

export async function requireUser(allowedRoles?: AppRole[]): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const [{ data: role, error: roleError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase.rpc("get_my_role"),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
    ]);

  if (roleError || profileError || !role || !profile) redirect("/acceso-denegado");
  if (allowedRoles && !allowedRoles.includes(role)) {
    redirect(role === "EMPLEADO" ? "/portal" : "/admin");
  }

  let companyName: string | null = null;
  if (profile.company_id) {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .maybeSingle();
    if (companyError) throw new Error("No se pudo consultar la empresa del usuario.");
    companyName = company?.name ?? null;
  }

  return { id: user.id, email: user.email, role, profile, companyName };
}
