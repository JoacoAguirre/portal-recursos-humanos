import { describe, expect, it } from "vitest";
import { requestResolutionSchema, validateRequestPayload } from "@/lib/validations/requests";

describe("validación de solicitudes", () => {
  it("rechaza un período de vacaciones invertido", () => {
    const result = validateRequestPayload("vacation", {
      start_date: "2026-03-10",
      end_date: "2026-03-08",
      calendar_days: 1
    });
    expect(result.success).toBe(false);
  });

  it("exige un motivo para rechazar una solicitud", () => {
    const result = requestResolutionSchema.safeParse({
      request_id: "8d920a15-238b-49e1-9c19-f5decaee28c3",
      expected_version: 1,
      new_status: "rejected"
    });
    expect(result.success).toBe(false);
  });

  it("calcula la cantidad calendario inclusiva y exige consistencia", () => {
    const valid = validateRequestPayload("vacation", {
      start_date: "2026-03-10",
      end_date: "2026-03-12",
      calendar_days: 3
    });
    const invalid = validateRequestPayload("vacation", {
      start_date: "2026-03-10",
      end_date: "2026-03-12",
      calendar_days: 2
    });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("no permite una actualización de datos vacía", () => {
    expect(validateRequestPayload("personal_data", {}).success).toBe(false);
  });
});
