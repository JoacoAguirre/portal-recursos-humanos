export function isMissingTableError(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
