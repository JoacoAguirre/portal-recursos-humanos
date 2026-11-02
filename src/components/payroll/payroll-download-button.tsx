"use client";

import { useState } from "react";
import { downloadPayrollSlipAction } from "@/app/actions/payroll";
import { Button } from "@/components/ui/button";

export function PayrollDownloadButton({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function download() {
    setMessage("");
    setLoading(true);
    try {
      const result = await downloadPayrollSlipAction(id);
      if (!result.ok || !result.url) {
        setMessage(result.ok ? "No se recibió el enlace del recibo." : result.error);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setMessage("No se pudo descargar el recibo. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <Button type="button" size="sm" variant="secondary" onClick={download} disabled={loading}>
        {loading ? "Preparando..." : "Descargar PDF"}
      </Button>
      {message && <p role="alert" className="mt-1 text-xs text-red-300">{message}</p>}
    </div>
  );
}
