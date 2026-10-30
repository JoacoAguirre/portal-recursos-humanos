"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { configureRoleAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { AppRole } from "@/types/database";

export function RoleAssignmentForm({ id, role }: { id: string; role: AppRole }) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState(role);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (nextRole === role || !window.confirm(`¿Cambiar el rol de ${role} a ${nextRole}?`)) return;
    setLoading(true);
    setMessage("");
    const result = await configureRoleAction(id, nextRole);
    if (result.ok) {
      setMessage("Rol actualizado.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return <div className="flex flex-wrap items-center gap-2"><select value={nextRole} onChange={(event) => setNextRole(event.target.value as AppRole)} className="h-9 rounded-lg border bg-slate-900 px-2 text-xs"><option value="EMPLEADO">Empleado</option><option value="RRHH_ADMIN">RRHH Admin</option><option value="SUPERADMIN">Superadmin</option></select><Button type="button" size="sm" variant="secondary" onClick={save} disabled={loading || nextRole === role}>{loading ? "Guardando..." : "Cambiar rol"}</Button>{message && <span role="status" className="text-xs text-emerald-300">{message}</span>}</div>;
}
