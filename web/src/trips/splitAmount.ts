// MAX_SPLIT_LEGS caps how many legs a single cost can be split into — keeps the
// "split a flight" helper sane (a handful of legs, not hundreds).
export const MAX_SPLIT_LEGS = 12

// splitAmount divides a total across n legs so the per-leg amounts sum back to
// the exact total to the cent. Any rounding remainder is spread one cent at a
// time across the first legs (e.g. 10 / 3 → [3.34, 3.33, 3.33]).
export function splitAmount(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100)
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}
