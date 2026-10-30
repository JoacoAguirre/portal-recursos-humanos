"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeStatusAction } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";

export function EmployeeStatusButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function update() {
    const action = active ? "desactivar" : "reactivar";
    if (!window.confirm(`¿Querés ${action} este empleado? Se conservará su historial.`)) return;
    setLoading(true);
    setMessage("");
    const result = await updateEmployeeStatusAction(id, !active);
    if (result.ok) router.refresh();
    else setMessage(result.error);
    setLoading(false);
  }

  return <div><Button type="button" variant="secondary" size="sm" onClick={update} disabled={loading}>{loading ? "Guardando..." : active ? "Desactivar" : "Reactivar"}</Button>{message && <p role="alert" className="mt-1 text-xs text-red-300">{message}</p>}</div>;
}
