"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({ email: z.string().email("Ingresá un correo válido.") });
type Values = z.infer<typeof schema>;

export function PasswordResetForm() {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: Values) {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-contrasena`
      });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
      <div className="space-y-2">
        <label htmlFor="reset-email" className="text-sm font-medium">Correo electrónico</label>
        <Input id="reset-email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
      </div>
      {status === "sent" && <p role="status" className="text-sm text-emerald-300">Si existe una cuenta asociada, recibirás instrucciones para recuperar el acceso.</p>}
      {status === "error" && <p role="alert" className="text-sm text-red-300">No se pudo procesar la solicitud. Intentá nuevamente.</p>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Enviar instrucciones"}</Button>
    </form>
  );
}
