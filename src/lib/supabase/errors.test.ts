import { describe, expect, it } from "vitest";
import { isMissingTableError } from "./errors";

describe("detección de migraciones de tablas faltantes", () => {
  it("reconoce tablas no creadas tanto en Postgres como en PostgREST", () => {
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205" })).toBe(true);
  });

  it("no clasifica otros errores de consulta como migraciones faltantes", () => {
    expect(isMissingTableError({ code: "42501" })).toBe(false);
    expect(isMissingTableError({ code: "PGRST204" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
