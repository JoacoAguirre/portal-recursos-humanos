"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { inviteHrAdminAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Company } from "@/types/database";

const schema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  company_id: z.string().uuid(),
  can_manage_employees: z.boolean(),
  can_manage_documents: z.boolean(),
  can_resolve_requests: z.boolean()
});
type Values = z.infer<typeof schema>;

export function InviteAdminForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { can_manage_employees: false, can_manage_documents: false, can_resolve_requests: true }
  });

  async function onSubmit(values: Values) {
    setLoading(true);
    setMessage("");
    setSuccess(false);
    const result = await inviteHrAdminAction(values);
    if (result.ok) {
      setSuccess(true);
      setMessage(result.invitationSent === false
        ? "Cuenta existente habilitada; no se envió un correo."
        : "Invitación enviada y permisos registrados.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><label htmlFor="admin-first" className="text-sm font-medium">Nombre</label><Input id="admin-first" {...register("first_name")} />{errors.first_name && <p className="text-xs text-red-400">Ingresá un nombre.</p>}</div>
        <div className="space-y-2"><label htmlFor="admin-last" className="text-sm font-medium">Apellido</label><Input id="admin-last" {...register("last_name")} />{errors.last_name && <p className="text-xs text-red-400">Ingresá un apellido.</p>}</div>
        <div className="space-y-2"><label htmlFor="admin-email" className="text-sm font-medium">Correo de invitación</label><Input id="admin-email" type="email" {...register("email")} />{errors.email && <p className="text-xs text-red-400">Ingresá un correo válido.</p>}</div>
        <div className="space-y-2"><label htmlFor="admin-company" className="text-sm font-medium">Empresa inicial</label><select id="admin-company" className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm" {...register("company_id")}><option value="">Seleccioná una empresa</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select>{errors.company_id && <p className="text-xs text-red-400">Seleccioná una empresa.</p>}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Permission name="can_manage_employees" label="Gestionar empleados" register={register} />
        <Permission name="can_manage_documents" label="Gestionar documentos" register={register} />
        <Permission name="can_resolve_requests" label="Resolver solicitudes" register={register} />
      </div>
      {message && <p role={success ? "status" : "alert"} className={success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
      <Button type="submit" disabled={loading || !companies.length}>{loading ? "Enviando..." : "Invitar administrador"}</Button>
    </form>
  );
}

function Permission({
  name, label, register
}: {
  name: "can_manage_employees" | "can_manage_documents" | "can_resolve_requests";
  label: string;
  register: ReturnType<typeof useForm<Values>>["register"];
}) {
  return <label className="flex items-start gap-2 rounded-lg border border-slate-700 p-3 text-sm"><input type="checkbox" className="mt-0.5 accent-blue-500" {...register(name)} />{label}</label>;
}
