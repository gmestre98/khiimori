// Shared display formatters. Keeping date/money formatting in one place means
// the whole app reads dates and amounts the same way (and multi-currency can
// land later by touching only this module — PRD §7 placeholder note).

// parseISO turns a YYYY-MM-DD string into a local-time Date (no timezone shift).
function parseISO(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

// shortDate renders "Jun 27" — month abbreviation + zero-padded day.
export function shortDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

// formatDateRange renders a friendly trip date range, matching the v1 design
// reference: "Apr 02 – Apr 14, 2026". When the two dates span different years,
// each side carries its own year ("Dec 28, 2025 – Jan 04, 2026").
export function formatDateRange(startISO: string, endISO: string): string {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameYear) {
    return `${shortDate(startISO)} – ${shortDate(endISO)}, ${end.getFullYear()}`
  }
  return `${shortDate(startISO)}, ${start.getFullYear()} – ${shortDate(endISO)}, ${end.getFullYear()}`
}

// fullDate renders "Friday, Apr 05 2026" — the day-view header date line.
// Composed manually so the year has no preceding comma (matches the design
// reference; toLocaleDateString would render "Apr 05, 2026").
export function fullDate(iso: string): string {
  const d = parseISO(iso)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${weekday}, ${shortDate(iso)} ${d.getFullYear()}`
}

// monthYear renders "Oct 2025" — used to date-stamp past trips.
export function monthYear(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// tripDayCount returns the inclusive number of days in a trip range.
export function tripDayCount(startISO: string, endISO: string): number {
  const days = Math.round((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / 86_400_000)
  return Math.max(1, days + 1)
}

// euroWhole renders a rounded euro amount with thousands separators: "€1,800".
// Used for headline figures (hero budget, summary tiles). Non-finite inputs
// (undefined/NaN from a partial rollup) fall back to €0 rather than throwing.
export function euroWhole(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return `€${Math.round(v).toLocaleString('en-US')}`
}

// euro renders a precise euro amount with two decimals: "€640.00". Used where
// exact spend matters (line items, cost entries). Non-finite inputs fall back
// to €0.00 rather than throwing.
export function euro(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return `€${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
