"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateDocumentAction } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";

export function DeactivateDocumentButton({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function deactivate() {
    if (!window.confirm("¿Dar de baja este documento? El registro histórico se conservará.")) return;
    setLoading(true);
    const result = await deactivateDocumentAction(id);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return <div><Button type="button" size="sm" variant="secondary" onClick={deactivate} disabled={loading}>{loading ? "Guardando..." : "Dar de baja"}</Button>{message && <p role="alert" className="mt-1 text-xs text-red-300">{message}</p>}</div>;
}
