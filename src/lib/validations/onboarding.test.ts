import { describe, expect, it } from "vitest";
import { onboardingProfileSchema } from "@/lib/validations/onboarding";

const validInput = {
  first_name: "Ana",
  last_name: "Prueba",
  contact_email: "ana@example.com",
  phone: "",
  address: ""
};

describe("validación del alta de usuario", () => {
  it("acepta datos personales válidos", () => {
    expect(onboardingProfileSchema.safeParse(validInput).success).toBe(true);
  });

  it("no permite cambiar permisos ni datos laborales desde el alta", () => {
    expect(onboardingProfileSchema.safeParse({ ...validInput, role: "SUPERADMIN", company_id: "otra" }).success).toBe(false);
  });

  it("exige un correo de contacto válido", () => {
    expect(onboardingProfileSchema.safeParse({ ...validInput, contact_email: "no-es-email" }).success).toBe(false);
  });
});
