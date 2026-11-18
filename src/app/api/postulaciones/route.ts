import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationSubmissionSchema, getCvFormat, MAX_CV_SIZE } from "@/lib/validations/applications";

const bucket = "job-applicant-cvs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_CV_SIZE + 32 * 1024) {
    return NextResponse.json({ error: "El formulario supera el tamaño máximo permitido de 5 MB para el CV." }, { status: 413 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario enviado." }, { status: 400 });
  }

  const vacancyChoice = formData.get("vacancy_id");
  if (typeof vacancyChoice !== "string" || !vacancyChoice) {
    return NextResponse.json({ error: "Seleccioná una vacante o la opción Otro." }, { status: 400 });
  }
  const parsed = applicationSubmissionSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    dni: formData.get("dni"),
    phone: formData.get("phone"),
    company_id: formData.get("company_id"),
    vacancy_id: vacancyChoice === "otro" ? null : vacancyChoice
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisá los datos personales, la empresa y la vacante seleccionada." }, { status: 400 });
  }

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_CV_SIZE) {
    return NextResponse.json({ error: "Adjuntá un CV de hasta 5 MB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = getCvFormat(file.name, file.type, bytes);
  if (!format) {
    return NextResponse.json({ error: "El CV debe ser un PDF, DOC o DOCX válido." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error("job_application_admin_client_unavailable");
    return NextResponse.json({ error: "El servicio de postulaciones no está disponible." }, { status: 503 });
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("id", parsed.data.company_id)
    .eq("active", true)
    .maybeSingle();
  if (companyError) {
    console.error("job_application_company_lookup_failed", companyError.code);
    return NextResponse.json({ error: "No se pudo validar la empresa seleccionada." }, { status: 503 });
  }
  if (!company) return NextResponse.json({ error: "La empresa seleccionada ya no está disponible." }, { status: 400 });

  if (parsed.data.vacancy_id) {
    const { data: vacancy, error: vacancyError } = await admin
      .from("job_vacancies")
      .select("id")
      .eq("id", parsed.data.vacancy_id)
      .eq("company_id", parsed.data.company_id)
      .eq("active", true)
      .maybeSingle();
    if (vacancyError) {
      console.error("job_application_vacancy_lookup_failed", vacancyError.code);
      return NextResponse.json({ error: "No se pudo validar la vacante seleccionada." }, { status: 503 });
    }
    if (!vacancy) return NextResponse.json({ error: "La vacante seleccionada ya no está disponible." }, { status: 400 });
  }

  const storagePath = `${parsed.data.company_id}/${randomUUID()}.${format}`;
  const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) {
    console.error("job_application_cv_upload_failed", uploadError.name);
    return NextResponse.json({ error: "No se pudo guardar el CV. Intentá nuevamente." }, { status: 503 });
  }

  const { data: application, error: insertError } = await admin
    .from("job_applications")
    .insert({
      ...parsed.data,
      is_spontaneous: parsed.data.vacancy_id === null,
      cv_storage_path: storagePath
    })
    .select("id")
    .single();
  if (insertError || !application) {
    const { error: cleanupError } = await admin.storage.from(bucket).remove([storagePath]);
    console.error("job_application_insert_failed", insertError?.code ?? "unknown");
    if (cleanupError) {
      console.error("job_application_cv_cleanup_failed", cleanupError.name);
      return NextResponse.json({ error: "No se pudo registrar la postulación ni limpiar el archivo. Contactá a Recursos Humanos." }, { status: 500 });
    }
    return NextResponse.json({ error: "No se pudo registrar la postulación. Intentá nuevamente." }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
