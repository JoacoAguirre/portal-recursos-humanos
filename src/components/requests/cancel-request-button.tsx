"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionResult } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({
  requestId,
  version,
  cancelAction
}: {
  requestId: string;
  version: number;
  cancelAction: (id: string, version: number) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function cancel() {
    if (!window.confirm("¿Querés cancelar esta solicitud? Esta acción quedará registrada.")) return;
    setLoading(true);
    setMessage("");
    const result = await cancelAction(requestId, version);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return <div><Button type="button" variant="secondary" onClick={cancel} disabled={loading}>{loading ? "Cancelando..." : "Cancelar solicitud"}</Button>{message && <p role="alert" className="mt-2 text-sm text-red-300">{message}</p>}</div>;
}
