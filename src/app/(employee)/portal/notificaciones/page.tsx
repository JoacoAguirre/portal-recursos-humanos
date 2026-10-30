import { NotificationList, NotificationItem } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function EmployeeNotificationsPage() {
  await requireUser(["EMPLEADO"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("id, title, message, type, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("No se pudieron cargar las notificaciones.");
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Notificaciones</h1><p className="mt-2 text-sm text-muted-foreground">Avisos personales de solicitudes y documentos.</p></div><NotificationList items={(data ?? []) as NotificationItem[]} /></div>;
}
