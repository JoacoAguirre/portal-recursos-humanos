import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkReadButton } from "@/components/notifications/mark-read-button";
import { formatDate } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: "request" | "document" | "system";
  read_at: string | null;
  created_at: string;
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  if (!items.length) return <Card><CardContent className="p-8 text-center"><Bell className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm font-medium">No tenés notificaciones</p></CardContent></Card>;
  return <Card><CardContent className="divide-y divide-slate-700 p-0">{items.map((item) => <div key={item.id} className={`flex flex-wrap items-start justify-between gap-4 p-5 ${item.read_at ? "" : "bg-blue-500/5"}`}><div className="flex gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.title}</p><Badge tone={item.type === "document" ? "warning" : "muted"}>{item.type === "request" ? "Solicitud" : item.type === "document" ? "Documento" : "Sistema"}</Badge>{!item.read_at && <Badge>Sin leer</Badge>}</div><p className="mt-2 text-sm text-slate-300">{item.message}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.created_at)}</p></div></div>{!item.read_at && <MarkReadButton id={item.id} />}</div>)}</CardContent></Card>;
}
