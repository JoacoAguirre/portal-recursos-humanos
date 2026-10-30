"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateEppItemAction } from "@/app/actions/configuration";
import { Button } from "@/components/ui/button";

export function EppDeactivateButton({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function deactivate() {
    if (!window.confirm("¿Desactivar este elemento? No se eliminarán las solicitudes históricas.")) return;
    setLoading(true);
    const result = await deactivateEppItemAction(id);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return <div><Button type="button" variant="ghost" size="sm" onClick={deactivate} disabled={loading}>{loading ? "..." : "Desactivar"}</Button>{message && <p role="alert" className="text-xs text-red-300">{message}</p>}</div>;
}
