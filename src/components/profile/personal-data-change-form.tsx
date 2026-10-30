"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPersonalDataChangeAction } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PersonalDataChangeForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    const result = await submitPersonalDataChangeAction({
      phone: String(formData.get("phone") ?? ""),
      contact_email: String(formData.get("contact_email") ?? ""),
      address: String(formData.get("address") ?? "")
    });
    if (result.ok) router.push("/portal/perfil?solicitud=enviada");
    else setMessage(result.error);
    setLoading(false);
  }

  return (
    <form action={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Completá solo los campos que querés actualizar. Los datos oficiales no cambian hasta su aprobación.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><label htmlFor="profile-phone" className="text-sm font-medium">Nuevo teléfono</label><Input id="profile-phone" name="phone" maxLength={40} /></div>
        <div className="space-y-2"><label htmlFor="profile-email" className="text-sm font-medium">Nuevo correo de contacto</label><Input id="profile-email" name="contact_email" type="email" maxLength={254} /></div>
        <div className="space-y-2 md:col-span-2"><label htmlFor="profile-address" className="text-sm font-medium">Nuevo domicilio</label><Input id="profile-address" name="address" maxLength={300} /></div>
      </div>
      {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
      <Button type="submit" disabled={loading}>{loading ? "Enviando..." : "Solicitar actualización"}</Button>
    </form>
  );
}
