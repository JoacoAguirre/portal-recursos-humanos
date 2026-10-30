import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const localOnly = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
const configured =
  process.env.RUN_LOCAL_RLS_TESTS === "true" &&
  localOnly &&
  Boolean(anonKey) &&
  Boolean(process.env.RLS_EMPLOYEE_EMAIL && process.env.RLS_EMPLOYEE_PASSWORD) &&
  Boolean(process.env.RLS_OTHER_REQUEST_ID && process.env.RLS_OTHER_PROFILE_ID) &&
  Boolean(process.env.RLS_ADMIN_EMAIL && process.env.RLS_ADMIN_PASSWORD) &&
  Boolean(process.env.RLS_UNASSIGNED_REQUEST_ID && process.env.RLS_UNASSIGNED_PROFILE_ID) &&
  Boolean(process.env.RLS_PRIVATE_STORAGE_PATH);

let employeeClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;
let anonymousClient: SupabaseClient | null = null;

const describeRls = describe.skipIf(!configured);

describeRls("políticas RLS contra Supabase local", () => {
  beforeAll(async () => {
    employeeClient = createClient(url, anonKey, { auth: { persistSession: false } });
    adminClient = createClient(url, anonKey, { auth: { persistSession: false } });
    anonymousClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const [{ error: employeeError }, { error: adminError }] = await Promise.all([
      employeeClient.auth.signInWithPassword({
        email: process.env.RLS_EMPLOYEE_EMAIL!,
        password: process.env.RLS_EMPLOYEE_PASSWORD!
      }),
      adminClient.auth.signInWithPassword({
        email: process.env.RLS_ADMIN_EMAIL!,
        password: process.env.RLS_ADMIN_PASSWORD!
      })
    ]);
    if (employeeError || adminError) throw new Error("No se pudieron autenticar los usuarios fixture de RLS local.");
  });

  afterAll(async () => {
    await Promise.all([
      employeeClient?.auth.signOut(),
      adminClient?.auth.signOut()
    ]);
  });

  it("permite a RR. HH. leer su propio perfil sin asignar una empresa al perfil", async () => {
    const { data: userResult } = await adminClient!.auth.getUser();
    expect(userResult.user).not.toBeNull();
    const { data: profile, error } = await adminClient!
      .from("profiles")
      .select("id,company_id")
      .eq("id", userResult.user!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(profile?.id).toBe(userResult.user!.id);
    expect(profile?.company_id).toBeNull();
  });

  it("impide que un empleado lea perfiles y solicitudes de otra persona", async () => {
    const [profile, request] = await Promise.all([
      employeeClient!.from("profiles").select("id").eq("id", process.env.RLS_OTHER_PROFILE_ID!).maybeSingle(),
      employeeClient!.from("requests").select("id").eq("id", process.env.RLS_OTHER_REQUEST_ID!).maybeSingle()
    ]);
    expect(profile.error).toBeNull();
    expect(request.error).toBeNull();
    expect(profile.data).toBeNull();
    expect(request.data).toBeNull();
  });

  it("impide que un empleado modifique su perfil directamente o resuelva una solicitud", async () => {
    const { data: userResult } = await employeeClient!.auth.getUser();
    expect(userResult.user).not.toBeNull();
    const { data: before } = await employeeClient!.from("profiles").select("employment_status").eq("id", userResult.user!.id).single();
    const { data: updatedRows, error: updateError } = await employeeClient!.from("profiles")
      .update({ employment_status: "inactive" })
      .eq("id", userResult.user!.id)
      .select("id");
    const { error: resolutionError } = await employeeClient!.rpc("resolve_request", {
      p_request_id: process.env.RLS_OTHER_REQUEST_ID!,
      p_expected_version: 1,
      p_new_status: "approved"
    });
    const { data: after } = await employeeClient!.from("profiles").select("employment_status").eq("id", userResult.user!.id).single();
    expect(updateError).toBeNull();
    expect(updatedRows).toHaveLength(0);
    expect(resolutionError).not.toBeNull();
    expect(after?.employment_status).toBe(before?.employment_status);
  });

  it("impide que RR. HH. lea registros de una empresa no asignada", async () => {
    const [profile, request] = await Promise.all([
      adminClient!.from("profiles").select("id").eq("id", process.env.RLS_UNASSIGNED_PROFILE_ID!).maybeSingle(),
      adminClient!.from("requests").select("id").eq("id", process.env.RLS_UNASSIGNED_REQUEST_ID!).maybeSingle()
    ]);
    expect(profile.error).toBeNull();
    expect(request.error).toBeNull();
    expect(profile.data).toBeNull();
    expect(request.data).toBeNull();
  });

  it("no permite lecturas anónimas de legajos", async () => {
    const result = await anonymousClient!.from("profiles").select("id").limit(1);
    expect(result.error).not.toBeNull();
  });

  it("no permite firmar un documento privado de otra empresa", async () => {
    const result = await employeeClient!.storage.from("hr-private").createSignedUrl(process.env.RLS_PRIVATE_STORAGE_PATH!, 60);
    expect(result.error).not.toBeNull();
  });

  it("impide que RR. HH. se otorgue el rol SUPERADMIN", async () => {
    const { data: current } = await adminClient!.auth.getUser();
    const result = await adminClient!.rpc("configure_user_role", {
      p_user_id: current.user!.id,
      p_role: "SUPERADMIN"
    });
    expect(result.error).not.toBeNull();
  });

  it.skipIf(!process.env.RLS_CONCURRENT_REQUEST_ID)(
    "rechaza la resolución concurrente si una versión ya fue modificada",
    async () => {
    const requestId = process.env.RLS_CONCURRENT_REQUEST_ID!;
    const { data: request, error: requestError } = await adminClient!
      .from("requests").select("version, status").eq("id", requestId).single();
    expect(requestError).toBeNull();
    expect(request?.status).toBe("pending");
    const [first, second] = await Promise.all([
      adminClient!.rpc("resolve_request", {
        p_request_id: requestId,
        p_expected_version: request!.version,
        p_new_status: "in_review"
      }),
      adminClient!.rpc("resolve_request", {
        p_request_id: requestId,
        p_expected_version: request!.version,
        p_new_status: "observed",
        p_comment: "Prueba de concurrencia local."
      })
    ]);
    expect([first.error, second.error].filter((error) => error === null)).toHaveLength(1);
    expect([first.error, second.error].filter((error) => error !== null)).toHaveLength(1);
  });

  it.skipIf(!process.env.RLS_PENDING_CHANGE_ID)(
    "mantiene los datos oficiales sin cambios mientras hay una actualización pendiente",
    async () => {
    const changeId = process.env.RLS_PENDING_CHANGE_ID!;
    const { data: userResult } = await employeeClient!.auth.getUser();
    const [{ data: before }, { data: change }] = await Promise.all([
      employeeClient!.from("profiles").select("phone, contact_email, address").eq("id", userResult.user!.id).single(),
      employeeClient!.from("personal_data_change_requests").select("employee_id, status").eq("id", changeId).single()
    ]);
    expect(change?.employee_id).toBe(userResult.user!.id);
    expect(["pending", "in_review", "observed"]).toContain(change?.status);
    const { data: after } = await employeeClient!.from("profiles").select("phone, contact_email, address").eq("id", userResult.user!.id).single();
    expect(after).toEqual(before);
  });
});
