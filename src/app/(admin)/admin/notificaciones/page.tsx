import { NotificationList, NotificationItem } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function AdminNotificationsPage() {
  const user = await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("id, title, message, type, read_at, related_entity_id, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("No se pudieron cargar las notificaciones.");
  const items = data ?? [];
  const requestIds = items.flatMap((item) => item.type === "request" && item.related_entity_id ? [item.related_entity_id] : []);
  const documentIds = items.flatMap((item) => item.type === "document" && item.related_entity_id ? [item.related_entity_id] : []);
  const [
    { data: requests, error: requestsError },
    { data: changes, error: changesError },
    { data: documents, error: documentsError }
  ] = await Promise.all([
    requestIds.length
      ? supabase.from("requests").select("id").in("id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? supabase.from("personal_data_change_requests").select("id").in("id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabase.from("employee_documents").select("id").in("id", documentIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (requestsError || changesError || documentsError) throw new Error("No se pudieron cargar los destinos de las notificaciones.");
  const requestSet = new Set((requests ?? []).map((row) => row.id));
  const changeSet = new Set((changes ?? []).map((row) => row.id));
  const documentSet = new Set((documents ?? []).map((row) => row.id));
  const linkedItems: NotificationItem[] = items.map((item) => ({
    ...item,
    href: item.related_entity_id && requestSet.has(item.related_entity_id)
      ? `/admin/solicitudes/${item.related_entity_id}`
      : item.related_entity_id && changeSet.has(item.related_entity_id)
        ? `/admin/solicitudes?cambio=${item.related_entity_id}`
        : item.related_entity_id && documentSet.has(item.related_entity_id)
          ? `/admin/documentos?documento=${item.related_entity_id}`
          : null
  }));
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Notificaciones</h1><p className="mt-2 text-sm text-muted-foreground">Avisos de gestión y vencimientos de tus empresas.</p></div><NotificationList items={linkedItems} readOnly={user.role === "GERENTE"} /></div>;
}
