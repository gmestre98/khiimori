// Stable cache keys for the on-device read cache (M11.1 S2).
//
// One place that maps a read to its resourceCache key so the screen that reads a
// resource and any code that refreshes it after a mutation always agree on the
// key. Keys mirror the API path they cache (e.g. `GET /trips/<id>/days/<date>`)
// so they are stable and human-auditable in devtools.

export const cacheKeys = {
  trips: () => 'GET /trips',
  day: (tripId: string, date: string) => `GET /trips/${tripId}/days/${date}`,
  backlog: (tripId: string) => `GET /trips/${tripId}/plan-items/backlog`,
  budgetRollup: (tripId: string) => `GET /trips/${tripId}/budget/rollup`,
  costEntries: (tripId: string) => `GET /trips/${tripId}/cost-entries`,
  journal: (tripId: string, dayId: string) => `GET /trips/${tripId}/days/${dayId}/journal`,
  photos: (tripId: string, dayId: string) => `GET /trips/${tripId}/days/${dayId}/journal/photos`,
} as const
