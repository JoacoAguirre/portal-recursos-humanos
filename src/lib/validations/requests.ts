import { z } from "zod";
import { RequestType } from "@/types/database";

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Ingresá una fecha válida.");

const payloadSchemas: Record<RequestType, z.ZodType<Record<string, unknown>>> = {
  leave: z.object({
    leave_type: z.string().trim().min(1, "Seleccioná el tipo de licencia.").max(100),
    start_date: dateSchema,
    end_date: dateSchema.optional().or(z.literal("")),
    reason: z.string().trim().min(1, "Indicá el motivo.").max(2000),
    observations: z.string().trim().max(2000).optional().or(z.literal(""))
  }).superRefine((data, ctx) => {
    if (data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "La fecha de fin debe ser posterior al inicio." });
    }
  }) as z.ZodType<Record<string, unknown>>,
  vacation: z.object({
    start_date: dateSchema,
    end_date: dateSchema,
    calendar_days: z.number().int().min(1).max(366),
    observations: z.string().trim().max(2000).optional().or(z.literal(""))
  }).superRefine((data, ctx) => {
    if (data.end_date < data.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "La fecha de fin debe ser posterior al inicio." });
    }
    const days =
      Math.round((Date.parse(`${data.end_date}T12:00:00Z`) - Date.parse(`${data.start_date}T12:00:00Z`)) / 86400000) + 1;
    if (data.calendar_days !== days) {
      ctx.addIssue({ code: "custom", path: ["calendar_days"], message: "El cálculo de días no coincide con el período." });
    }
  }) as z.ZodType<Record<string, unknown>>,
  epp: z.object({
    item_name: z.string().trim().min(1, "Seleccioná el elemento.").max(120),
    quantity: z.number().int().min(1).max(1000),
    reason: z.string().trim().min(1, "Indicá el motivo.").max(2000),
    observations: z.string().trim().max(2000).optional().or(z.literal(""))
  }) as z.ZodType<Record<string, unknown>>,
  personal_data: z.object({
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    contact_email: z.union([z.literal(""), z.string().email().max(254)]).optional(),
    address: z.string().trim().max(300).optional().or(z.literal(""))
  }).refine(
    (data) => Object.values(data).some((value) => typeof value === "string" && value.trim().length > 0),
    "Ingresá al menos un dato para actualizar."
  ) as z.ZodType<Record<string, unknown>>,
  other: z.object({
    subject: z.string().trim().min(1, "Ingresá un asunto.").max(160),
    details: z.string().trim().min(1, "Describí la solicitud.").max(4000)
  }) as z.ZodType<Record<string, unknown>>
};

export const requestSubmissionSchema = z.object({
  request_type: z.enum(["leave", "vacation", "epp", "other"]),
  payload: z.record(z.string(), z.unknown())
});

export function validateRequestPayload(type: RequestType, payload: unknown) {
  return payloadSchemas[type].safeParse(payload);
}

export const requestResolutionSchema = z.object({
  request_id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  new_status: z.enum(["in_review", "observed", "approved", "rejected"]),
  comment: z.string().trim().max(4000).optional(),
  internal_note: z.string().trim().max(4000).optional()
}).superRefine((data, ctx) => {
  if ((data.new_status === "rejected" || data.new_status === "observed") && !data.comment?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["comment"],
      message: data.new_status === "rejected" ? "El motivo del rechazo es obligatorio." : "El comentario de observación es obligatorio."
    });
  }
});
