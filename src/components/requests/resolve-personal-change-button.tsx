"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolvePersonalDataChangeAction } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ResolvePersonalChangeButton({ id }: { id: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function resolve(approve: boolean) {
    setMessage("");
    if (!approve && !comment.trim()) {
      setMessage("El motivo del rechazo es obligatorio.");
      return;
    }
    if (!window.confirm(approve ? "¿Aplicar los cambios al perfil oficial?" : "¿Rechazar esta solicitud?")) return;
    setLoading(true);
    const result = await resolvePersonalDataChangeAction(id, approve, comment.trim() || undefined);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return (
    <div className="mt-4 space-y-3">
      <label htmlFor={`personal-change-comment-${id}`} className="text-xs font-medium text-muted-foreground">Comentario (obligatorio para rechazar)</label>
      <Textarea id={`personal-change-comment-${id}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} className="min-h-20" />
      {message && <p role="alert" className="text-xs text-red-300">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => resolve(true)} disabled={loading}>Aprobar y aplicar</Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => resolve(false)} disabled={loading}>Rechazar</Button>
      </div>
    </div>
  );
}
