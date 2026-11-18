import { describe, expect, it } from "vitest";
import {
  applicationSubmissionSchema,
  getCvFormat,
  jobVacancySchema,
  MAX_CV_SIZE
} from "@/lib/validations/applications";

describe("validación de postulaciones", () => {
  it("valida los datos obligatorios y admite postulaciones espontáneas", () => {
    const result = applicationSubmissionSchema.safeParse({
      first_name: "Ana",
      last_name: "Pérez",
      dni: "12345678",
      phone: "+54 11 1234-5678",
      company_id: "00000000-0000-4000-8000-000000000001",
      vacancy_id: null
    });
    expect(result.success).toBe(true);
  });

  it("rechaza datos personales inválidos y vacantes sin empresa", () => {
    expect(applicationSubmissionSchema.safeParse({
      first_name: "",
      last_name: "Pérez",
      dni: "12",
      phone: "teléfono",
      company_id: "empresa",
      vacancy_id: null
    }).success).toBe(false);
    expect(jobVacancySchema.safeParse({
      company_id: "00000000-0000-4000-8000-000000000001",
      title: " "
    }).success).toBe(false);
  });

  it("acepta PDF, DOC y DOCX solo cuando coinciden extensión, MIME y firma", () => {
    expect(getCvFormat("cv.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(getCvFormat("cv.doc", "application/msword", new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225]))).toBe("doc");
    const docx = new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml word/document.xml");
    expect(getCvFormat("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx)).toBe("docx");
    expect(getCvFormat("cv.pdf", "application/pdf", new Uint8Array([1, 2, 3]))).toBeNull();
    expect(getCvFormat("cv.exe", "application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(MAX_CV_SIZE).toBe(5 * 1024 * 1024);
  });
});
