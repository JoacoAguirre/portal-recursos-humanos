import { z } from "zod";

export const MAX_CV_SIZE = 5 * 1024 * 1024;
export const CV_MIME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
} as const;

export const applicationSubmissionSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  dni: z.string().trim().regex(/^[0-9]{7,8}$/),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,40}$/),
  company_id: z.string().uuid(),
  vacancy_id: z.string().uuid().nullable()
});

export const jobVacancySchema = z.object({
  company_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional()
});

export const updateJobVacancySchema = jobVacancySchema.extend({
  id: z.string().uuid()
});

export function getCvFormat(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array
): keyof typeof CV_MIME_TYPES | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf" && mimeType === CV_MIME_TYPES.pdf) {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" ? "pdf" : null;
  }
  if (extension === "doc" && mimeType === CV_MIME_TYPES.doc) {
    return bytes.slice(0, 8).join(",") === "208,207,17,224,161,177,26,225" ? "doc" : null;
  }
  if (extension === "docx" && mimeType === CV_MIME_TYPES.docx) {
    const archiveContents = new TextDecoder().decode(bytes);
    return bytes.slice(0, 4).join(",") === "80,75,3,4" &&
      archiveContents.includes("[Content_Types].xml") &&
      archiveContents.includes("word/document.xml")
      ? "docx"
      : null;
  }
  return null;
}
