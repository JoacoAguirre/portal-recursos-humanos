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
  searchParams: Promise<{ empresa?: string; accion?: string; page?: string }>;
}) {
  await requireUser(["RRHH_ADMIN", "SUPERADMIN"]);
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
    "document.deactivated", "user.role.changed", "admin.created", "admin.company_access.changed"
  ];
  const action = actionNames.includes(params.accion ?? "") ? params.accion : null;
  const pageSize = 50;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  let query = supabase.from("audit_logs")
    .select("id, actor_id, company_id, action, entity_type, entity_id, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  if (action) query = query.eq("action", action);
  const { data: logs, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("No se pudo consultar el historial.");
  const actorIds = [...new Set((logs ?? []).flatMap((item) => item.actor_id ? [item.actor_id] : []))];
  const companyIds = [...new Set((logs ?? []).flatMap((item) => item.company_id ? [item.company_id] : []))];
  const [{ data: actors, error: actorsError }, { data: relatedCompanies, error: relatedCompaniesError }] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (actorsError || relatedCompaniesError) throw new Error("No se pudo cargar el contexto del historial.");
  const actorName = new Map((actors ?? []).map((actor) => [actor.id, `${actor.first_name} ${actor.last_name}`]));
  const companyName = new Map((relatedCompanies ?? []).map((company) => [company.id, company.name]));
  const paramsForLinks = new URLSearchParams();
  if (companyId) paramsForLinks.set("empresa", companyId);
  if (action) paramsForLinks.set("accion", action);
  const queryString = paramsForLinks.toString();
  const pageHref = (target: number) => `/admin/historial?${queryString ? `${queryString}&` : ""}page=${target}`;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Historial de auditoría</h1><p className="mt-2 text-sm text-muted-foreground">Registro de solo lectura de acciones relevantes dentro de tus empresas.</p></div>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5"><label htmlFor="empresa" className="text-xs text-muted-foreground">Empresa</label><select id="empresa" name="empresa" defaultValue={companyId ?? ""} className="h-10 min-w-48 rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="accion" className="text-xs text-muted-foreground">Acción</label><select id="accion" name="accion" defaultValue={action ?? ""} className="h-10 min-w-56 rounded-lg border bg-slate-900 px-3 text-sm"><option value="">Todas</option>{actionNames.map((name) => <option key={name} value={name}>{actionLabel(name)}</option>)}</select></div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <Card><CardContent className="p-0">
        {!logs?.length ? <p className="p-8 text-center text-sm text-muted-foreground">No hay acciones registradas para estos filtros.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-900/40 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Fecha y hora</th><th className="px-4 py-3 font-medium">Actor</th><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Acción</th><th className="px-4 py-3 font-medium">Entidad</th><th className="px-5 py-3 font-medium">Contexto</th></tr></thead>
            <tbody className="divide-y divide-slate-700">{logs.map((log) => <tr key={log.id}><td className="whitespace-nowrap px-5 py-4">{formatDateTime(log.created_at)}</td><td className="px-4 py-4">{log.actor_id ? actorName.get(log.actor_id) ?? "Usuario" : "Sistema"}</td><td className="px-4 py-4">{log.company_id ? companyName.get(log.company_id) ?? "—" : "Global"}</td><td className="px-4 py-4 font-medium">{actionLabel(log.action)}</td><td className="px-4 py-4">{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}</td><td className="px-5 py-4"><Metadata metadata={log.metadata as Record<string, unknown>} /></td></tr>)}</tbody>
          </table></div>
        )}
        <div className="flex items-center justify-between border-t border-slate-700 px-5 py-4 text-sm"><span className="text-muted-foreground">{count ?? 0} evento(s) · Página {page} de {totalPages}</span><div className="flex gap-2">{page > 1 && <Button asChild size="sm" variant="secondary"><a href={pageHref(page - 1)}>Anterior</a></Button>}{page < totalPages && <Button asChild size="sm" variant="secondary"><a href={pageHref(page + 1)}>Siguiente</a></Button>}</div></div>
      </CardContent></Card>
    </div>
  );
}

function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const visible = Object.entries(metadata).filter(([key, value]) => key !== "payload" && value !== null);
  if (!visible.length) return <span className="text-muted-foreground">—</span>;
  return <span className="text-xs text-muted-foreground">{visible.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" · ")}</span>;
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
    "user.role.changed": "Rol de usuario modificado",
    "admin.created": "Administrador creado",
    "admin.company_access.changed": "Permiso por empresa modificado"
  };
  return labels[action] ?? action;
}
