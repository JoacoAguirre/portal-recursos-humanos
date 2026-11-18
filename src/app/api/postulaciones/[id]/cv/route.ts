import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "CV no disponible." }, { status: 404 });

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Ingresá con una cuenta autorizada." }, { status: 401 });
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "GERENTE" && role !== "SUPERADMIN")) {
    return NextResponse.json({ error: "No tenés permiso para consultar CV." }, { status: 403 });
  }

  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .select("cv_storage_path")
    .eq("id", id)
    .maybeSingle();
  if (applicationError || !application) return NextResponse.json({ error: "CV no disponible." }, { status: 404 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error("job_application_cv_admin_client_unavailable");
    return NextResponse.json({ error: "No se pudo abrir el CV." }, { status: 503 });
  }
  const download = new URL(request.url).searchParams.get("descargar") === "1";
  const extension = application.cv_storage_path.split(".").pop() ?? "pdf";
  const { data, error } = await admin.storage
    .from("job-applicant-cvs")
    .createSignedUrl(application.cv_storage_path, 60, download ? { download: `cv-${id}.${extension}` } : {});
  if (error || !data?.signedUrl) {
    console.error("job_application_cv_sign_failed", error?.name ?? "unknown");
    return NextResponse.json({ error: "No se pudo abrir el CV." }, { status: 503 });
  }
  return NextResponse.redirect(data.signedUrl);
}
