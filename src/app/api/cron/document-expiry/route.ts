import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "El proceso no está configurado." }, { status: 503 });
  }
  const { data, error } = await supabase.rpc("enqueue_document_expiry_notifications", {
    p_time_zone: process.env.APP_TIME_ZONE ?? "America/Argentina/Buenos_Aires"
  });
  if (error) {
    console.error("document_expiry_cron_failed", error.code ?? "unknown");
    return NextResponse.json({ error: "No se pudieron procesar las alertas." }, { status: 500 });
  }
  return NextResponse.json({ created: data ?? 0 });
}
