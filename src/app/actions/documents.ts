"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type DocumentActionResult = { ok: true; url?: string } | { ok: false; error: string };

const documentMetadataSchema = z.object({
  employee_id: z.string().uuid(),
  document_type: z.string().trim().min(1).max(120),
  issue_date: z.string().date().optional().or(z.literal("")),
  expiration_date: z.string().date().optional().or(z.literal("")),
  expiration_unknown: z.enum(["true", "false"]),
  notes: z.string().trim().max(2000).optional()
});

export async function downloadDocumentAction(documentId: string): Promise<DocumentActionResult> {
  if (!z.string().uuid().safeParse(documentId).success) return { ok: false, error: "Documento no disponible." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: document, error } = await supabase
    .from("employee_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("active", true)
    .maybeSingle();
  if (error || !document) return { ok: false, error: "No tenés acceso a este documento." };
  const { data, error: urlError } = await supabase.storage
    .from("hr-private")
    .createSignedUrl(document.storage_path, 60);
  if (urlError || !data?.signedUrl) return { ok: false, error: "No se pudo generar un acceso temporal al documento." };
  return { ok: true, url: data.signedUrl };
}

export async function uploadEmployeeDocumentAction(formData: FormData): Promise<DocumentActionResult> {
  const parsed = documentMetadataSchema.safeParse({
    employee_id: formData.get("employee_id"),
    document_type: formData.get("document_type"),
    issue_date: formData.get("issue_date") || "",
    expiration_date: formData.get("expiration_date") || "",
    expiration_unknown: formData.get("expiration_unknown") ?? "false",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return { ok: false, error: "Revisá los datos del documento." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "El archivo debe tener entre 1 byte y 10 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const isPng = file.type === "image/png" && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  const isJpeg = file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!isPdf && !isPng && !isJpeg) return { ok: false, error: "Solo se admiten archivos PDF, PNG o JPEG válidos." };
  if (
    parsed.data.expiration_unknown === "true" &&
    parsed.data.expiration_date
  ) return { ok: false, error: "Indicá una fecha de vencimiento o marcá el vencimiento como desconocido, no ambas." };
  if (parsed.data.issue_date && parsed.data.expiration_date && parsed.data.expiration_date < parsed.data.issue_date) {
    return { ok: false, error: "El vencimiento no puede ser anterior a la fecha de emisión." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (employeeError || !employee?.company_id) return { ok: false, error: "No tenés acceso a ese legajo." };

  const id = crypto.randomUUID();
  const extension = isPdf ? "pdf" : isPng ? "png" : "jpg";
  const storagePath = `${employee.company_id}/${parsed.data.employee_id}/${id}.${extension}`;
  const { error: metadataError } = await supabase.from("employee_documents").insert({
    id,
    employee_id: parsed.data.employee_id,
    company_id: employee.company_id,
    document_type: parsed.data.document_type,
    storage_path: storagePath,
    issue_date: parsed.data.issue_date || null,
    expiration_date: parsed.data.expiration_date || null,
    expiration_unknown: parsed.data.expiration_unknown === "true",
    notes: parsed.data.notes || null,
    created_by: user.id,
    active: true
  });
  if (metadataError) {
    return {
      ok: false,
      error: metadataError.code === "42501"
        ? "No tenés permisos para gestionar documentos en esta empresa."
        : "No se pudo registrar el documento. Revisá si ya existe un registro equivalente."
    };
  }

  const { error: uploadError } = await supabase.storage.from("hr-private").upload(storagePath, bytes, {
    contentType: isPdf ? "application/pdf" : isPng ? "image/png" : "image/jpeg",
    upsert: false
  });
  if (uploadError) {
    const { data: deactivated, error: deactivateError } = await supabase
      .from("employee_documents")
      .update({ active: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deactivateError || !deactivated) {
      console.error("document_upload_cleanup_failed");
      return {
        ok: false,
        error: "No se pudo guardar el archivo ni desactivar el registro. Contactá al administrador."
      };
    }
    return { ok: false, error: "No se pudo guardar el archivo privado. El registro quedó desactivado; volvé a intentarlo." };
  }

  revalidatePath("/admin/documentos");
  revalidatePath("/portal/documentos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deactivateDocumentAction(documentId: string): Promise<DocumentActionResult> {
  if (!z.string().uuid().safeParse(documentId).success) return { ok: false, error: "Documento no válido." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data, error } = await supabase
    .from("employee_documents")
    .update({ active: false })
    .eq("id", documentId)
    .eq("active", true)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se pudo dar de baja el documento." };
  revalidatePath("/admin/documentos");
  revalidatePath("/portal/documentos");
  return { ok: true };
}
