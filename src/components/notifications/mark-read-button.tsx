"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    setMessage("");
    const result = await markNotificationReadAction(id);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return <div><Button type="button" variant="ghost" size="sm" onClick={markRead} disabled={loading}>{loading ? "Guardando..." : "Marcar leída"}</Button>{message && <p role="alert" className="text-xs text-red-300">{message}</p>}</div>;
}
