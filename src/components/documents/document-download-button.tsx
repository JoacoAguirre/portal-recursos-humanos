"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadDocumentAction } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";

export function DocumentDownloadButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setLoading(true);
    setError("");
    const result = await downloadDocumentAction(id);
    if (result.ok && result.url) {
      window.location.assign(result.url);
    } else {
      setError(result.ok ? "No se pudo abrir el documento." : result.error);
    }
    setLoading(false);
  }

  return <div><Button type="button" variant="secondary" size="sm" onClick={download} disabled={loading}><Download className="h-4 w-4" />{loading ? "Preparando..." : "Descargar"}</Button>{error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}</div>;
}
