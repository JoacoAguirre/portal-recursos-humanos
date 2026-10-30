"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { createRequestAction, submitPersonalDataChangeAction } from "@/app/actions/requests";
import { validateRequestPayload } from "@/lib/validations/requests";
import { ActionResult } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EppItem } from "@/types/hr";

const formSchema = z.object({
  request_type: z.enum(["leave", "vacation", "epp", "personal_data", "other"]),
  leave_type: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  reason: z.string().optional(),
  observations: z.string().optional(),
  item_name: z.string().optional(),
  quantity: z.string().optional(),
  phone: z.string().optional(),
  contact_email: z.string().optional(),
  address: z.string().optional(),
  subject: z.string().optional(),
  details: z.string().optional()
});
type FormValues = z.infer<typeof formSchema>;

const labels = {
  leave: "Licencia / ausencia",
  vacation: "Vacaciones",
  epp: "Ropa / EPP",
  personal_data: "Actualización de datos",
  other: "Otra solicitud"
} as const;

export function NewRequestForm({ catalog }: { catalog: EppItem[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { request_type: "leave" }
  });
  const type = useWatch({ control, name: "request_type" }) ?? "leave";
  const start = useWatch({ control, name: "start_date" });
  const end = useWatch({ control, name: "end_date" });
  const calendarDays = useMemo(() => {
    if (!start || !end || end < start) return null;
    return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
  }, [start, end]);

  function showFieldErrors(result: ReturnType<typeof validateRequestPayload>) {
    if (result.success) return false;
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field in formSchema.shape) {
        setError(field as keyof FormValues, { message: issue.message });
      }
    }
    setMessage(result.error.issues[0]?.message ?? "Revisá los campos del formulario.");
    return true;
  }

  async function onSubmit(values: FormValues) {
    setMessage("");
    setSuccess(false);
    const payload: Record<string, unknown> = {};
    if (type === "leave") {
      Object.assign(payload, {
        leave_type: values.leave_type ?? "",
        start_date: values.start_date ?? "",
        end_date: values.end_date ?? "",
        reason: values.reason ?? "",
        observations: values.observations ?? ""
      });
    } else if (type === "vacation") {
      Object.assign(payload, {
        start_date: values.start_date ?? "",
        end_date: values.end_date ?? "",
        calendar_days: calendarDays ?? 0,
        observations: values.observations ?? ""
      });
    } else if (type === "epp") {
      Object.assign(payload, {
        item_name: values.item_name ?? "",
        quantity: Number(values.quantity),
        reason: values.reason ?? "",
        observations: values.observations ?? ""
      });
    } else if (type === "personal_data") {
      Object.assign(payload, {
        phone: values.phone ?? "",
        contact_email: values.contact_email ?? "",
        address: values.address ?? ""
      });
    } else {
      Object.assign(payload, {
        subject: values.subject ?? "",
        details: values.details ?? ""
      });
    }

    const validation = validateRequestPayload(type, payload);
    if (showFieldErrors(validation)) return;

    setLoading(true);
    try {
      const result: ActionResult =
        type === "personal_data"
          ? await submitPersonalDataChangeAction(payload)
          : await createRequestAction({ request_type: type, payload });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSuccess(true);
      router.push(type === "personal_data" ? "/portal/perfil?solicitud=enviada" : "/portal/solicitudes?creada=1");
      router.refresh();
    } catch {
      setMessage("No se pudo enviar la solicitud. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const fieldError = (name: keyof FormValues) => errors[name]?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="request_type" className="text-sm font-medium">Tipo de solicitud</label>
        <select id="request_type" className="h-10 w-full rounded-lg border bg-slate-900/60 px-3 text-sm" {...register("request_type")}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {type === "leave" && (
        <>
          <div className="space-y-2">
            <label htmlFor="leave_type" className="text-sm font-medium">Tipo de licencia o ausencia</label>
            <Input id="leave_type" placeholder="Ej.: trámite personal" {...register("leave_type")} />
            {fieldError("leave_type") && <p className="text-xs text-red-400">{fieldError("leave_type")}</p>}
          </div>
          <DateFields register={register} fieldError={fieldError} includeEnd />
          <TextField name="reason" label="Motivo" register={register} fieldError={fieldError} required />
          <TextField name="observations" label="Observaciones" register={register} fieldError={fieldError} multiline />
        </>
      )}

      {type === "vacation" && (
        <>
          <DateFields register={register} fieldError={fieldError} includeEnd />
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm">
            Días calendario estimados: <strong>{calendarDays ?? "—"}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">Es un cálculo inclusivo de días calendario, no representa un saldo ni reemplaza las reglas laborales aplicables.</span>
          </div>
          <TextField name="observations" label="Observaciones" register={register} fieldError={fieldError} multiline />
        </>
      )}

      {type === "epp" && (
        <>
          <div className="space-y-2">
            <label htmlFor="item_name" className="text-sm font-medium">Elemento</label>
            <select id="item_name" className="h-10 w-full rounded-lg border bg-slate-900/60 px-3 text-sm" {...register("item_name")}>
              <option value="">Seleccioná un elemento</option>
              {catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            {fieldError("item_name") && <p className="text-xs text-red-400">{fieldError("item_name")}</p>}
            {!catalog.length && <p className="text-xs text-amber-300">El catálogo está vacío. Contactá a Recursos Humanos.</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="quantity" className="text-sm font-medium">Cantidad</label>
            <Input id="quantity" type="number" min="1" max="1000" {...register("quantity")} />
            {fieldError("quantity") && <p className="text-xs text-red-400">{fieldError("quantity")}</p>}
          </div>
          <TextField name="reason" label="Motivo del pedido" register={register} fieldError={fieldError} required />
          <TextField name="observations" label="Observaciones" register={register} fieldError={fieldError} multiline />
        </>
      )}

      {type === "personal_data" && (
        <div className="space-y-4 rounded-lg border border-slate-700 p-4">
          <p className="text-sm text-muted-foreground">Los cambios se aplican al perfil oficial solo después de la revisión de RR. HH.</p>
          <TextField name="phone" label="Teléfono" register={register} fieldError={fieldError} />
          <TextField name="contact_email" label="Correo de contacto" register={register} fieldError={fieldError} type="email" />
          <TextField name="address" label="Domicilio" register={register} fieldError={fieldError} />
        </div>
      )}

      {type === "other" && (
        <>
          <TextField name="subject" label="Asunto" register={register} fieldError={fieldError} required />
          <TextField name="details" label="Detalle" register={register} fieldError={fieldError} required multiline />
        </>
      )}

      {message && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</p>}
      {success && <p role="status" className="text-sm text-emerald-300">La solicitud se envió correctamente.</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-700 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={loading || (type === "epp" && !catalog.length)}>{loading ? "Enviando..." : "Enviar solicitud"}</Button>
      </div>
    </form>
  );
}

function DateFields({
  register,
  fieldError,
  includeEnd
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  fieldError: (name: keyof FormValues) => string | undefined;
  includeEnd: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <label htmlFor="start_date" className="text-sm font-medium">Fecha desde</label>
        <Input id="start_date" type="date" {...register("start_date")} />
        {fieldError("start_date") && <p className="text-xs text-red-400">{fieldError("start_date")}</p>}
      </div>
      {includeEnd && (
        <div className="space-y-2">
          <label htmlFor="end_date" className="text-sm font-medium">Fecha hasta</label>
          <Input id="end_date" type="date" {...register("end_date")} />
          {fieldError("end_date") && <p className="text-xs text-red-400">{fieldError("end_date")}</p>}
        </div>
      )}
    </div>
  );
}

function TextField({
  name,
  label,
  register,
  fieldError,
  required = false,
  multiline = false,
  type = "text"
}: {
  name: keyof FormValues;
  label: string;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  fieldError: (name: keyof FormValues) => string | undefined;
  required?: boolean;
  multiline?: boolean;
  type?: string;
}) {
  const id = String(name);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</label>
      {multiline
        ? <Textarea id={id} {...register(name)} />
        : <Input id={id} type={type} {...register(name)} />}
      {fieldError(name) && <p className="text-xs text-red-400">{fieldError(name)}</p>}
    </div>
  );
}
