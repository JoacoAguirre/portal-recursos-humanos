import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subtractCalendarYears, todayInTimeZone } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const suppliedBytes = Buffer.from(authorization);
  const expectedBytes = Buffer.from(expected);
  if (!secret || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "El proceso no está configurado." }, { status: 503 });
  }

  const cutoff = subtractCalendarYears(todayInTimeZone(), 1);
  let deletedCount = 0;
  while (true) {
    const { data: expired, error: queryError } = await supabase
      .from("payroll_slips")
      .select("id, storage_path")
      .lt("pay_period", cutoff)
      .limit(100);
    if (queryError) {
      console.error("payroll_retention_query_failed", queryError.code ?? "unknown");
      return NextResponse.json({ error: "No se pudieron consultar los recibos vencidos." }, { status: 500 });
    }
    if (!expired?.length) break;

    const { error: storageError } = await supabase.storage
      .from("hr-private")
      .remove(expired.map((slip) => slip.storage_path));
    if (storageError) {
      console.error("payroll_retention_storage_delete_failed", storageError.message);
      return NextResponse.json({ error: "No se pudieron eliminar archivos vencidos." }, { status: 500 });
    }
    const { error: deleteError } = await supabase
      .from("payroll_slips")
      .delete()
      .in("id", expired.map((slip) => slip.id));
    if (deleteError) {
      console.error("payroll_retention_metadata_delete_failed", deleteError.code ?? "unknown");
      return NextResponse.json({ error: "No se pudieron eliminar los registros vencidos." }, { status: 500 });
    }
    deletedCount += expired.length;
  }
  return NextResponse.json({ deleted: deletedCount });
}
