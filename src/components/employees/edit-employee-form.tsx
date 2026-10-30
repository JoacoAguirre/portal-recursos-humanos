"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { updateEmployeeProfileAction } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Profile } from "@/types/database";

const schema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  employee_number: z.string().trim().min(1),
  department: z.string().trim(),
  position: z.string().trim(),
  phone: z.string().trim(),
  address: z.string().trim(),
  hire_date: z.string()
});
type Values = z.infer<typeof schema>;

export function EditEmployeeForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      employee_number: profile.employee_number ?? "",
      department: profile.department ?? "",
      position: profile.position ?? "",
      phone: profile.phone ?? "",
      address: profile.address ?? "",
      hire_date: profile.hire_date ?? ""
    }
  });

  async function onSubmit(values: Values) {
    setLoading(true);
    setMessage("");
    const result = await updateEmployeeProfileAction({ id: profile.id, ...values });
    if (result.ok) {
      setMessage("Legajo actualizado.");
      router.refresh();
    } else setMessage(result.error);
    setLoading(false);
  }

  return <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="first_name" label="Nombre" register={register} error={errors.first_name?.message} />
      <Field name="last_name" label="Apellido" register={register} error={errors.last_name?.message} />
      <Field name="employee_number" label="Legajo" register={register} error={errors.employee_number?.message} />
      <Field name="department" label="Sector" register={register} />
      <Field name="position" label="Puesto" register={register} />
      <Field name="hire_date" label="Fecha de ingreso" register={register} type="date" />
      <Field name="phone" label="Teléfono" register={register} />
      <Field name="address" label="Domicilio" register={register} />
    </div>
    {message && <p role="status" className={message.startsWith("Legajo") ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
    <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar cambios"}</Button>
  </form>;
}

function Field({
  name, label, register, error, type = "text"
}: {
  name: keyof Values;
  label: string;
  register: ReturnType<typeof useForm<Values>>["register"];
  error?: string;
  type?: string;
}) {
  const id = `edit-${String(name)}`;
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><Input id={id} type={type} {...register(name)} />{error && <p className="text-xs text-red-400">{error}</p>}</div>;
}
