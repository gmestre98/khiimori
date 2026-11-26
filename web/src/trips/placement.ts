// placementText says where an item lands among a day's timed items: between
// the two around its time, before the first, after the last, or at the end
// when it has no time.
export function placementText(
  items: { title: string; start_time?: string | null }[],
  time: string,
): string | null {
  const timed = items
    .filter((i) => i.start_time)
    .map((i) => ({ title: i.title, t: (i.start_time as string).slice(0, 5) }))
    .sort((a, b) => a.t.localeCompare(b.t))
  if (items.length === 0) return null
  if (!time) return 'No time: it goes at the end of the day.'
  const t = time.slice(0, 5)
  const before = [...timed].reverse().find((i) => i.t <= t)
  const after = timed.find((i) => i.t > t)
  if (before && after)
    return `Lands between ${before.title} (${before.t}) and ${after.title} (${after.t}).`
  if (before) return `Lands after ${before.title} (${before.t}).`
  if (after) return `Lands before ${after.title} (${after.t}).`
  return null
}
