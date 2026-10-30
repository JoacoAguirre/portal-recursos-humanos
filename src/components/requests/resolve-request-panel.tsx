"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveRequestAction } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RequestStatus } from "@/types/database";

export function ResolveRequestPanel({
  requestId,
  version,
  status
}: {
  requestId: string;
  version: number;
  status: RequestStatus;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function resolve(newStatus: "in_review" | "observed" | "approved" | "rejected") {
    setMessage("");
    if ((newStatus === "observed" || newStatus === "rejected") && !comment.trim()) {
      setMessage(newStatus === "rejected" ? "Ingresá el motivo del rechazo." : "Ingresá el comentario para observar.");
      return;
    }
    if (newStatus === "approved" && !window.confirm("¿Confirmás la aprobación de esta solicitud?")) return;
    if (newStatus === "rejected" && !window.confirm("¿Confirmás el rechazo? El motivo será visible para el empleado.")) return;
    setLoading(true);
    const result = await resolveRequestAction({
      request_id: requestId,
      expected_version: version,
      new_status: newStatus,
      comment: comment.trim() || undefined,
      internal_note: internalNote.trim() || undefined
    });
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  if (!["pending", "in_review", "observed"].includes(status)) {
    return <p className="text-sm text-muted-foreground">Esta solicitud ya fue resuelta. Su historial se conserva para auditoría.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="resolution-comment" className="text-sm font-medium">Comentario visible para el empleado</label>
        <Textarea id="resolution-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} placeholder="Obligatorio para observar o rechazar." />
      </div>
      <details className="rounded-lg border border-slate-700 p-3">
        <summary className="cursor-pointer text-sm font-medium">Agregar nota interna</summary>
        <div className="mt-3 space-y-2">
          <label htmlFor="internal-note" className="text-sm text-muted-foreground">Solo visible para RR. HH.</label>
          <Textarea id="internal-note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={4000} />
        </div>
      </details>
      {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {status === "pending" && <Button type="button" variant="secondary" disabled={loading} onClick={() => resolve("in_review")}>Pasar a revisión</Button>}
        <Button type="button" variant="secondary" disabled={loading} onClick={() => resolve("observed")}>Observar</Button>
        <Button type="button" variant="destructive" disabled={loading} onClick={() => resolve("rejected")}>Rechazar</Button>
        <Button type="button" disabled={loading} onClick={() => resolve("approved")}>{loading ? "Guardando..." : "Aprobar"}</Button>
      </div>
    </div>
  );
}
