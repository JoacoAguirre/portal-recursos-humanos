"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres."),
  confirm: z.string()
}).refine((value) => value.password === value.confirm, {
  path: ["confirm"],
  message: "Las contraseñas no coinciden."
});
type Values = z.infer<typeof schema>;

export function PasswordUpdateForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit({ password }: Values) {
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setMessage("El enlace venció o ya fue utilizado. Solicitá uno nuevo.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("No se pudo actualizar la contraseña. Solicitá un enlace nuevo.");
        return;
      }
      router.replace("/login?password=actualizada");
      router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servicio de acceso.");
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
    <div className="space-y-2"><label htmlFor="new-password" className="text-sm font-medium">Nueva contraseña</label><Input id="new-password" type="password" autoComplete="new-password" {...register("password")} />{errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}</div>
    <div className="space-y-2"><label htmlFor="confirm-password" className="text-sm font-medium">Confirmar contraseña</label><Input id="confirm-password" type="password" autoComplete="new-password" {...register("confirm")} />{errors.confirm && <p className="text-xs text-red-400">{errors.confirm.message}</p>}</div>
    {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
    <Button type="submit" className="w-full" disabled={loading}>{loading ? "Actualizando..." : "Actualizar contraseña"}</Button>
  </form>;
}
