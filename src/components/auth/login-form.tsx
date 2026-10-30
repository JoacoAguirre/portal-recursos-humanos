"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().email("Ingresá un correo válido."),
  password: z.string().min(1, "Ingresá tu contraseña.")
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    const showExpiredLinkMessage = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.get("error_code") === "otp_expired") {
        setMessage("El enlace venció o ya fue utilizado. Solicitá un enlace nuevo a Recursos Humanos.");
      }
    };
    const timeout = window.setTimeout(showExpiredLinkMessage, 0);
    window.addEventListener("hashchange", showExpiredLinkMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("hashchange", showExpiredLinkMessage);
    };
  }, []);

  async function onSubmit(values: LoginValues) {
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        setMessage("No se pudo iniciar sesión. Verificá tus datos o solicitá ayuda a RR. HH.");
        return;
      }
      const { data: role, error: roleError } = await supabase.rpc("get_my_role");
      if (roleError || !role) {
        await supabase.auth.signOut();
        setMessage("Tu cuenta todavía no tiene acceso al portal. Contactá a Recursos Humanos.");
        return;
      }
      router.replace(role === "EMPLEADO" ? "/portal" : "/admin");
      router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servicio de acceso. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">Correo electrónico</label>
        <Input id="email" type="email" autoComplete="email" placeholder="nombre@empresa.com" aria-invalid={Boolean(errors.email)} {...register("email")} />
        {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
          <a href="/recuperar-contrasena" className="text-xs text-blue-400 hover:text-blue-300">¿La olvidaste?</a>
        </div>
        <div className="relative">
          <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" aria-invalid={Boolean(errors.password)} className="pr-12" {...register("password")} />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-white"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
      </div>
      {message && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
