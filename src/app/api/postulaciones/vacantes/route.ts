import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("empresa") ?? "";
  if (!uuidPattern.test(companyId)) {
    return NextResponse.json({ error: "Seleccioná una empresa válida." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error("job_vacancies_admin_client_unavailable");
    return NextResponse.json({ error: "No se pudieron cargar las vacantes." }, { status: 503 });
  }
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("active", true)
    .maybeSingle();
  if (companyError) {
    console.error("job_vacancies_company_lookup_failed", companyError.code);
    return NextResponse.json({ error: "No se pudieron cargar las vacantes." }, { status: 503 });
  }
  if (!company) return NextResponse.json({ vacancies: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data, error } = await admin
    .from("job_vacancies")
    .select("id, title")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("title");
  if (error) {
    console.error("job_vacancies_public_lookup_failed", error.code);
    return NextResponse.json({ error: "No se pudieron cargar las vacantes." }, { status: 503 });
  }
  return NextResponse.json({ vacancies: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
