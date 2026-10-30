"use client";

import { useState } from "react";
import { resendUserSetupAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";

export function ResendUserSetupButton({ userId, email }: { userId: string; email: string }) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function send() {
    setLoading(true);
    setMessage("");
    setSuccess(false);
    try {
      const result = await resendUserSetupAction(userId);
      setSuccess(result.ok);
      setMessage(result.ok ? "Enlace enviado." : result.error);
      if (result.ok) setConfirming(false);
    } catch {
      setSuccess(false);
      setMessage("No se pudo enviar el enlace. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {!confirming ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)} disabled={loading}>
          Enviar enlace de alta
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Se enviará un enlace de configuración a {email}.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={send} disabled={loading}>{loading ? "Enviando..." : "Confirmar envío"}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>Cancelar</Button>
          </div>
        </div>
      )}
      {message && <p role={success ? "status" : "alert"} className={success ? "text-xs text-emerald-300" : "text-xs text-red-300"}>{message}</p>}
    </div>
  );
}
