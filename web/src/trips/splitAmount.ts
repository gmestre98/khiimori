// MAX_SPLIT_PARTS caps how many parts a single cost can be split into — keeps
// the split helper sane (a handful of parts, not hundreds).
export const MAX_SPLIT_PARTS = 12

// splitAmount divides a total across n parts so the per-part amounts sum back to
// the exact total to the cent. Any rounding remainder is spread one cent at a
// time across the first parts (e.g. 10 / 3 → [3.34, 3.33, 3.33]).
export function splitAmount(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100)
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}
