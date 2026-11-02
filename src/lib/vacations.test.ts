import { describe, expect, it } from "vitest";
import { calendarDaysByYear, getReservedVacationDays, getVacationEntitlement } from "./vacations";
import { isDateAtLeastDaysAhead } from "./utils";

describe("política anual de vacaciones", () => {
  it.each([
    ["2021-12-31", 14],
    ["2021-12-30", 21],
    ["2016-12-31", 21],
    ["2016-12-30", 28],
    ["2006-12-31", 28],
    ["2006-12-30", 35]
  ])("calcula la antigüedad de %s al 31 de diciembre", (hireDate, days) => {
    expect(getVacationEntitlement(hireDate, 2026)).toEqual({ days, requiresReview: false });
  });

  it("deja en revisión los legajos sin fecha o con menos de seis meses", () => {
    expect(getVacationEntitlement(null, 2026)).toEqual({ days: null, requiresReview: true });
    expect(getVacationEntitlement("2026-07-01", 2026)).toEqual({ days: null, requiresReview: true });
    expect(getVacationEntitlement("2026-06-30", 2026)).toEqual({ days: 14, requiresReview: false });
  });

  it("distribuye períodos y reservas entre años calendario", () => {
    expect(calendarDaysByYear("2026-12-30", "2027-01-02")).toEqual([
      { year: 2026, days: 2 },
      { year: 2027, days: 2 }
    ]);
    expect(getReservedVacationDays([
      { status: "approved", payload: { start_date: "2026-12-30", end_date: "2027-01-02" } },
      { status: "rejected", payload: { start_date: "2026-06-01", end_date: "2026-06-03" } }
    ], 2026)).toBe(2);
  });

  it("permite fechas desde exactamente 30 días de anticipación", () => {
    expect(isDateAtLeastDaysAhead("2026-12-01", "2026-11-01", 30)).toBe(true);
    expect(isDateAtLeastDaysAhead("2026-11-30", "2026-11-01", 30)).toBe(false);
  });
});
