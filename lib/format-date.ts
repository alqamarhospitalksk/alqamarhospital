// Display dates as dd/mm/yyyy. Takes an ISO string ("2026-10-06" or "2026-10-06T10:00:00Z")
// or a Date; the calendar date is read straight from the ISO text so no timezone shift occurs.
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const iso = typeof value === "string" ? value : value.toISOString();
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso.slice(0, 10);
}
