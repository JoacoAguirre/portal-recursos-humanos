import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { RequestStatus, RequestType } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const statusLabels: Record<RequestStatus, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  observed: "Observada",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada"
};

export const requestTypeLabels: Record<RequestType, string> = {
  leave: "Licencia / ausencia",
  vacation: "Vacaciones",
  epp: "Ropa / EPP",
  personal_data: "Actualización de datos",
  other: "Otro"
};

export function formatDate(value: string | null, timeZone = process.env.APP_TIME_ZONE ?? "America/Argentina/Buenos_Aires") {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value: string | null, timeZone = process.env.APP_TIME_ZONE ?? "America/Argentina/Buenos_Aires") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function todayInTimeZone(timeZone = process.env.APP_TIME_ZONE ?? "America/Argentina/Buenos_Aires") {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

export function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(days)) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isDateAtLeastDaysAhead(value: string, today: string, days: number) {
  return value >= addCalendarDays(today, days);
}

export function subtractCalendarYears(value: string, years: number) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(years)) return value;
  const targetYear = date.getUTCFullYear() - years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate());
  return `${targetYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
