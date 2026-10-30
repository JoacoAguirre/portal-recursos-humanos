"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { inviteEmployeeAction } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Company } from "@/types/database";

const schema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  employee_number: z.string().min(1),
  company_id: z.string().uuid(),
  department: z.string().optional(),
  position: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  hire_date: z.string().optional()
});
type Values = z.infer<typeof schema>;

export function InviteEmployeeForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setMessage("");
    setLoading(true);
    const result = await inviteEmployeeAction(values);
    if (!result.ok) setMessage(result.error);
    else {
      setMessage("Invitación enviada y empleado registrado.");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="first_name" label="Nombre" register={register} error={errors.first_name?.message} required />
        <Field name="last_name" label="Apellido" register={register} error={errors.last_name?.message} required />
        <Field name="email" label="Correo de invitación" register={register} error={errors.email?.message} type="email" required />
        <Field name="employee_number" label="Legajo" register={register} error={errors.employee_number?.message} required />
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="company_id" className="text-sm font-medium">Empresa</label>
          <select id="company_id" className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm" {...register("company_id")}>
            <option value="">Seleccioná una empresa</option>
            {companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
          {errors.company_id && <p className="text-xs text-red-400">Seleccioná una empresa.</p>}
        </div>
        <Field name="department" label="Sector" register={register} />
        <Field name="position" label="Puesto" register={register} />
        <Field name="hire_date" label="Fecha de ingreso" register={register} type="date" />
        <Field name="phone" label="Teléfono" register={register} />
        <Field name="address" label="Domicilio" register={register} />
      </div>
      {message && <p role={message.startsWith("Invitación") ? "status" : "alert"} className={message.startsWith("Invitación") ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={loading || !companies.length}>{loading ? "Enviando invitación..." : "Invitar empleado"}</Button></div>
    </form>
  );
}

function Field({
  name,
  label,
  register,
  error,
  type = "text",
  required = false
}: {
  name: keyof Values;
  label: string;
  register: ReturnType<typeof useForm<Values>>["register"];
  error?: string;
  type?: string;
  required?: boolean;
}) {
  const id = String(name);
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}{required && " *"}</label><Input id={id} type={type} {...register(name)} />{error && <p className="text-xs text-red-400">{error}</p>}</div>;
}
