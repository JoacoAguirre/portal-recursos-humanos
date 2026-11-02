export type VacationRequestPeriod = {
  status: string;
  payload: Record<string, unknown>;
};

export function getVacationEntitlement(hireDate: string | null, year: number) {
  if (!hireDate) return { days: null, requiresReview: true };
  const yearEnd = `${year}-12-31`;
  if (hireDate > yearEnd || hireDate > `${year}-06-30`) {
    return { days: null, requiresReview: true };
  }
  if (hireDate >= `${year - 5}-12-31`) return { days: 14, requiresReview: false };
  if (hireDate >= `${year - 10}-12-31`) return { days: 21, requiresReview: false };
  if (hireDate >= `${year - 20}-12-31`) return { days: 28, requiresReview: false };
  return { days: 35, requiresReview: false };
}

export function calendarDaysByYear(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const result: { year: number; days: number }[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const yearStart = Date.UTC(year, 0, 1, 12);
    const yearEnd = Date.UTC(year, 11, 31, 12);
    const segmentStart = Math.max(start.getTime(), yearStart);
    const segmentEnd = Math.min(end.getTime(), yearEnd);
    result.push({
      year,
      days: Math.floor((segmentEnd - segmentStart) / 86_400_000) + 1
    });
  }
  return result;
}

export function getReservedVacationDays(requests: VacationRequestPeriod[], year: number) {
  return requests.reduce((total, request) => {
    if (request.status === "cancelled" || request.status === "rejected") return total;
    const startDate = request.payload.start_date;
    const endDate = request.payload.end_date;
    if (typeof startDate !== "string" || typeof endDate !== "string") return total;
    const yearPart = calendarDaysByYear(startDate, endDate).find((part) => part.year === year);
    return total + (yearPart?.days ?? 0);
  }, 0);
}
