import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Company } from "@/types/database";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AuditHistoryPage({
  searchParams
}: {
  searchParams: Promise<{ empresa?: string; accion?: string; actor?: string; page?: string }>;
}) {
  await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: companyData, error: companyError } = await supabase.from("companies").select("*").eq("active", true).order("name");
  if (companyError) throw new Error("No se pudieron cargar las empresas para el historial.");
  const companies = (companyData ?? []) as Company[];
  const requestedCompanyId = params.empresa ?? "";
  const companyId = uuidPattern.test(requestedCompanyId) && companies.some((company) => company.id === requestedCompanyId) ? requestedCompanyId : null;
  const actionNames = [
    "request.created", "request.in_review", "request.observed", "request.approved", "request.rejected",
    "request.cancelled", "employee.created", "profile.updated", "profile.change.requested",
    "profile.change.approved", "profile.change.rejected", "document.created", "document.updated",
    "document.deactivated", "company.updated", "epp.created", "epp.updated", "user.role.changed",
    "user.onboarding.reopened", "admin.created", "admin.company_access.changed",
    "registration.approved", "registration.rejected"
  ];
  const action = actionNames.includes(params.accion ?? "") ? params.accion : null;
  const requestedActorId = params.actor ?? "";
  const actorId = requestedActorId === "system" || uuidPattern.test(requestedActorId) ? requestedActorId : null;
  let actorQuery = supabase.from("profiles").select("id, first_name, last_name").order("last_name").order("first_name");
  if (companyId) actorQuery = actorQuery.eq("company_id", companyId);
  const { data: availableActors, error: availableActorsError } = await actorQuery;
  if (availableActorsError) throw new Error("No se pudieron cargar los actores del historial.");
  const actorsById = new Map((availableActors ?? []).map((actor) => [actor.id, `${actor.first_name} ${actor.last_name}`]));
  const pageSize = 50;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  let query = supabase.from("audit_logs")
    .select("id, actor_id, company_id, action, entity_type, entity_id, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  if (action) query = query.eq("action", action);
  if (actorId === "system") query = query.is("actor_id", null);
  else if (actorId) query = query.eq("actor_id", actorId);
  const { data: logs, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("No se pudo consultar el historial.");
  const companyIds = [...new Set((logs ?? []).flatMap((item) => item.company_id ? [item.company_id] : []))];
  const [{ data: relatedCompanies, error: relatedCompaniesError }] = await Promise.all([
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (relatedCompaniesError) throw new Error("No se pudo cargar el contexto del historial.");
  const actorName = actorsById;
  const companyName = new Map((relatedCompanies ?? []).map((company) => [company.id, company.name]));
  const paramsForLinks = new URLSearchParams();
  if (companyId) paramsForLinks.set("empresa", companyId);
  if (action) paramsForLinks.set("accion", action);
  if (actorId) paramsForLinks.set("actor", actorId);
  const queryString = paramsForLinks.toString();
  const pageHref = (target: number) => `/admin/historial?${queryString ? `${queryString}&` : ""}page=${target}`;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Historial de auditoría</h1><p className="mt-2 text-sm text-muted-foreground">Registro de solo lectura de acciones relevantes dentro de tus empresas.</p></div>
      <form className="rounded-2xl border border-slate-700/80 bg-card p-5 shadow-sm">
        <div className="mb-4"><h2 className="text-sm font-semibold">Filtrar actividad</h2><p className="mt-1 text-xs text-muted-foreground">Combiná empresa, actor y acción para encontrar eventos específicos.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
          <div className="space-y-2"><label htmlFor="empresa" className="block text-xs font-medium text-slate-300">Empresa</label><select id="empresa" name="empresa" defaultValue={companyId ?? ""} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"><option value="">Todas las empresas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
          <div className="space-y-2"><label htmlFor="actor" className="block text-xs font-medium text-slate-300">Actor</label><select id="actor" name="actor" defaultValue={actorId ?? ""} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"><option value="">Todos los actores</option><option value="system">Sistema</option>{(availableActors ?? []).map((actor) => <option key={actor.id} value={actor.id}>{actor.first_name} {actor.last_name}</option>)}</select></div>
          <div className="space-y-2"><label htmlFor="accion" className="block text-xs font-medium text-slate-300">Acción</label><select id="accion" name="accion" defaultValue={action ?? ""} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"><option value="">Todas las acciones</option>{actionNames.map((name) => <option key={name} value={name}>{actionLabel(name)}</option>)}</select></div>
          <Button type="submit" variant="secondary" className="h-11 w-full px-6 sm:w-fit">Aplicar filtros</Button>
        </div>
      </form>
      <Card className="overflow-hidden border-slate-700/80 shadow-sm"><CardContent className="p-0">
        {!logs?.length ? <div className="p-12 text-center"><p className="text-sm font-medium">No hay actividad para mostrar</p><p className="mt-1 text-sm text-muted-foreground">Probá con otros filtros para encontrar eventos.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-900/50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3.5 font-medium">Fecha y hora</th><th className="px-4 py-3.5 font-medium">Actor</th><th className="px-4 py-3.5 font-medium">Empresa</th><th className="px-4 py-3.5 font-medium">Acción</th><th className="px-4 py-3.5 font-medium">Entidad</th><th className="px-5 py-3.5 font-medium">Contexto</th></tr></thead>
            <tbody className="divide-y divide-slate-700/70">{logs.map((log) => <tr key={log.id} className="transition-colors hover:bg-slate-800/35"><td className="whitespace-nowrap px-5 py-4 text-xs text-slate-300">{formatDateTime(log.created_at)}</td><td className="px-4 py-4 font-medium">{log.actor_id ? actorName.get(log.actor_id) ?? "Usuario" : "Sistema"}</td><td className="px-4 py-4 text-slate-300">{log.company_id ? companyName.get(log.company_id) ?? "—" : "General"}</td><td className="px-4 py-4"><span className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-200">{actionLabel(log.action)}</span></td><td className="px-4 py-4 text-xs text-slate-300">{entityLabel(log.entity_type)}{log.entity_id ? <span className="ml-1 font-mono text-slate-400">· {log.entity_id.slice(0, 8)}</span> : ""}</td><td className="max-w-sm px-5 py-4"><Metadata metadata={log.metadata as Record<string, unknown>} /></td></tr>)}</tbody>
          </table></div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/80 bg-slate-950/20 px-5 py-4 text-sm"><span className="text-muted-foreground">{count ?? 0} evento(s) · Página {page} de {totalPages}</span><div className="flex gap-2">{page > 1 && <Button asChild size="sm" variant="secondary"><a href={pageHref(page - 1)}>Anterior</a></Button>}{page < totalPages && <Button asChild size="sm" variant="secondary"><a href={pageHref(page + 1)}>Siguiente</a></Button>}</div></div>
      </CardContent></Card>
    </div>
  );
}

function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const visible = Object.entries(metadata).filter(([key, value]) => key !== "payload" && value !== null);
  if (!visible.length) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1.5">{visible.map(([key, value]) => <span key={key} className="max-w-full rounded-md border border-slate-700/80 bg-slate-950/30 px-2 py-1 text-[11px] leading-relaxed text-slate-300"><span className="text-slate-500">{metadataKeyLabel(key)}:</span> {Array.isArray(value) ? value.map(metadataValueLabel).join(", ") : metadataValueLabel(value)}</span>)}</div>;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    personal_data_change: "Cambio de datos personales",
    request: "Solicitud",
    profile: "Perfil",
    employee_document: "Documento del empleado",
    company: "Empresa",
    epp_catalog: "Catálogo de ropa y EPP",
    user: "Usuario",
    employee_registration: "Registro de empleado"
  };
  return labels[entity] ?? "Otro registro";
}

function metadataKeyLabel(key: string) {
  const labels: Record<string, string> = {
    changed: "Campos modificados",
    changed_name: "Nombre modificado",
    changed_active: "Estado modificado",
    active: "Activo",
    document_type: "Tipo de documento",
    employee_number: "Número de empleado",
    employee_id: "Empleado",
    role: "Rol",
    previous_role: "Rol anterior",
    new_role: "Rol nuevo",
    enabled: "Acceso habilitado",
    can_manage_employees: "Puede gestionar empleados",
    can_manage_documents: "Puede gestionar documentos",
    can_resolve_requests: "Puede resolver solicitudes",
    version: "Versión"
  };
  return labels[key] ?? key;
}

function metadataValueLabel(value: unknown): string {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value !== "string") return String(value);

  const labels: Record<string, string> = {
    name: "nombre",
    employee_number: "número de empleado",
    dni: "DNI",
    company: "empresa",
    department: "área",
    position: "puesto",
    phone: "teléfono",
    address: "domicilio",
    hire_date: "fecha de ingreso",
    employment_status: "estado laboral",
    SUPERADMIN: "Superadministrador",
    RRHH_ADMIN: "Administrador de RR. HH.",
    GERENTE: "Gerente",
    EMPLEADO: "Empleado"
  };
  return labels[value] ?? value;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "request.created": "Solicitud creada",
    "request.in_review": "Solicitud en revisión",
    "request.observed": "Solicitud observada",
    "request.approved": "Solicitud aprobada",
    "request.rejected": "Solicitud rechazada",
    "request.cancelled": "Solicitud cancelada",
    "employee.created": "Empleado creado",
    "profile.updated": "Perfil actualizado",
    "profile.change.requested": "Cambio de perfil solicitado",
    "profile.change.approved": "Cambio de perfil aprobado",
    "profile.change.rejected": "Cambio de perfil rechazado",
    "document.created": "Documento cargado",
    "document.updated": "Documento actualizado",
    "document.deactivated": "Documento dado de baja",
    "company.updated": "Empresa actualizada",
    "epp.created": "Elemento EPP creado",
    "epp.updated": "Elemento EPP actualizado",
    "user.role.changed": "Rol de usuario modificado",
    "user.onboarding.reopened": "Alta de usuario reabierta",
    "admin.created": "Administrador creado",
    "registration.approved": "Registro de empleado aprobado",
    "registration.rejected": "Registro de empleado rechazado",
    "admin.company_access.changed": "Permiso por empresa modificado"
  };
  return labels[action] ?? action;
}
