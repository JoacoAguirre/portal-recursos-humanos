"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { subtractCalendarYears, todayInTimeZone } from "@/lib/utils";

export type PayrollActionResult = { ok: true; url?: string } | { ok: false; error: string };

const uuidSchema = z.string().uuid();
const payrollMetadataSchema = z.object({
  employee_id: z.string().uuid(),
  pay_period: z.string().date()
});

export async function uploadPayrollSlipAction(formData: FormData): Promise<PayrollActionResult> {
  const parsed = payrollMetadataSchema.safeParse({
    employee_id: formData.get("employee_id"),
    pay_period: formData.get("pay_period")
  });
  if (!parsed.success) return { ok: false, error: "Seleccioná un empleado y una fecha válida." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "El recibo debe tener entre 1 byte y 10 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type !== "application/pdf" || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return { ok: false, error: "Solo se admiten archivos PDF válidos." };
  }

  const today = todayInTimeZone();
  const cutoff = subtractCalendarYears(today, 1);
  if (parsed.data.pay_period < cutoff || parsed.data.pay_period > today) {
    return { ok: false, error: "La fecha del recibo debe estar dentro del último año y no puede ser futura." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: role, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError || (role !== "RRHH_ADMIN" && role !== "SUPERADMIN")) {
    return { ok: false, error: "No tenés permisos para cargar recibos." };
  }
  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (employeeError || !employee?.company_id) return { ok: false, error: "No se encontró el legajo seleccionado." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "El almacenamiento privado no está configurado." };
  }

  const id = crypto.randomUUID();
  const storagePath = `payroll/${employee.company_id}/${parsed.data.employee_id}/${id}.pdf`;
  const { error: metadataError } = await supabase.from("payroll_slips").insert({
    id,
    employee_id: parsed.data.employee_id,
    company_id: employee.company_id,
    pay_period: parsed.data.pay_period,
    storage_path: storagePath,
    uploaded_by: user.id
  });
  if (metadataError) {
    return {
      ok: false,
      error: metadataError.code === "23505"
        ? "Ya existe un recibo cargado para esa fecha."
        : metadataError.code === "42501"
          ? "No tenés permiso para gestionar recibos de esa empresa."
          : "No se pudo registrar el recibo."
    };
  }

  const { error: uploadError } = await supabase.storage.from("hr-private").upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false
  });
  if (uploadError) {
    const { error: cleanupError } = await admin.from("payroll_slips").delete().eq("id", id);
    if (cleanupError) {
      console.error("payroll_upload_cleanup_failed", cleanupError.code ?? "unknown");
      return { ok: false, error: "No se pudo guardar el archivo ni limpiar su registro. Contactá al administrador." };
    }
    return { ok: false, error: "No se pudo guardar el recibo en el almacenamiento privado." };
  }

  revalidatePath("/admin/recibos");
  revalidatePath("/portal/recibos");
  return { ok: true };
}

export async function downloadPayrollSlipAction(id: string): Promise<PayrollActionResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Recibo no disponible." };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Tu sesión venció. Ingresá nuevamente." };
  const { data: slip, error } = await supabase
    .from("payroll_slips")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !slip) return { ok: false, error: "No tenés acceso a este recibo o ya cumplió el plazo de conservación." };
  const { data, error: urlError } = await supabase.storage
    .from("hr-private")
    .createSignedUrl(slip.storage_path, 60);
  if (urlError || !data?.signedUrl) return { ok: false, error: "No se pudo generar un acceso temporal al recibo." };
  return { ok: true, url: data.signedUrl };
}
