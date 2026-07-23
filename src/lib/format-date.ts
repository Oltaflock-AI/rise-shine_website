/**
 * Site-wide date display format: DD-MM-YY (e.g. "23-07-26").
 * Accepts "YYYY-MM-DD" or a full ISO datetime; pure string slicing so no
 * timezone shifts. All user-facing dates must go through this helper.
 */
export function formatDate(iso: string | null | undefined): string {
  const d = (iso || "").slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "";
  return `${day}-${m}-${y.slice(2)}`;
}
