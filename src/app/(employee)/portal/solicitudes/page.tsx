import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/requests/status-badge";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTypeLabels } from "@/lib/utils";
import { RequestStatus } from "@/types/database";

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ estado?: string; page?: string }> }) {
  await requireUser(["EMPLEADO"]);
  const params = await searchParams;
  const supabase = await createClient();
  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const validStatuses: RequestStatus[] = ["pending", "in_review", "observed", "approved", "rejected", "cancelled"];
  const status = validStatuses.includes(params.estado as RequestStatus) ? params.estado as RequestStatus : null;
  let query = supabase.from("requests").select("id, request_type, status, created_at, updated_at", { count: "exact" }).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: requests, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("No se pudieron consultar tus solicitudes.");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Mis solicitudes</h1><p className="mt-2 text-sm text-muted-foreground">Consultá el estado y el historial de tus trámites.</p></div>
        <Button asChild><Link href="/portal/solicitudes/nueva"><Plus className="h-4 w-4" />Nueva solicitud</Link></Button>
      </div>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <label htmlFor="estado" className="text-xs font-medium text-muted-foreground">Estado</label>
          <select id="estado" name="estado" defaultValue={status ?? ""} className="h-10 min-w-48 rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Todos</option>
            {validStatuses.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          {!requests?.length ? (
            <div className="p-8 text-center"><p className="font-medium">No encontramos solicitudes</p><p className="mt-2 text-sm text-muted-foreground">Probá con otro estado o creá una solicitud nueva.</p></div>
          ) : (
            <>
              <div className="divide-y divide-slate-700">
                {requests.map((request) => (
                  <Link key={request.id} href={`/portal/solicitudes/${request.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-800/40">
                    <div><p className="font-medium">{requestTypeLabels[request.request_type]}</p><p className="mt-1 text-xs text-muted-foreground">Creada {formatDate(request.created_at)} · Actualizada {formatDate(request.updated_at)}</p></div>
                    <StatusBadge status={request.status} />
                  </Link>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} status={status} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Pagination({ page, totalPages, status }: { page: number; totalPages: number; status: string | null }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-700 px-5 py-4 text-sm">
      <span className="text-muted-foreground">Página {page} de {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 && <Button asChild variant="secondary" size="sm"><Link href={`?${status ? `estado=${status}&` : ""}page=${page - 1}`}>Anterior</Link></Button>}
        {page < totalPages && <Button asChild variant="secondary" size="sm"><Link href={`?${status ? `estado=${status}&` : ""}page=${page + 1}`}>Siguiente</Link></Button>}
      </div>
    </div>
  );
}
