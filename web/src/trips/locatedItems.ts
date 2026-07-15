import type { Day, LatLng } from '../lib/api'

// LocatedItem is a single geocodable stop in itinerary order. Most items yield
// one LocatedItem; a transport leg yields two — its origin (`role: 'from'`) then
// its destination (`role: 'to'`) — so both ends show on the map. The flat list
// aligns positionally with fetchDayRoute's returned waypoints
// (waypoints[i] ↔ locatedItems[i]).
//
// `id` is the owning entity id (PlanItem.id / Stay.id) and is shared by both
// endpoints of a leg — clicking either end selects the same list row. `key` is
// unique per point (a stable React key). `feature` is the numbered itinerary
// unit the point belongs to (both leg endpoints share one feature): the pin
// number shown to the user is `feature + 1`. `done` marks whether the thing
// actually happened so the map can fade what didn't.
export interface LocatedItem {
  id: string
  key: string
  label: string
  location: string
  done: boolean
  feature: number
  role: 'point' | 'from' | 'to'
}

// collectLocatedItems returns stays then plan items (by sort_order) that have a
// location, in the same order passed to fetchDayRoute. A transport plan item is
// expanded into its origin then destination (each a located point) so both ends
// route and pin; every other kind contributes a single point from its `location`.
// Used by the maps and the planning list (pin badges).
export function collectLocatedItems(day: Pick<Day, 'stays' | 'plan_items'>): LocatedItem[] {
  const out: LocatedItem[] = []
  let feature = 0

  for (const s of day.stays ?? []) {
    if (!s.location) continue
    out.push({
      id: s.id,
      key: s.id,
      label: s.name,
      location: s.location,
      done: true,
      feature,
      role: 'point',
    })
    feature++
  }

  const items = [...(day.plan_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  for (const i of items) {
    const done = i.status === 'done'
    if ((i.kind ?? 'activity') === 'transport') {
      // Transport stores its endpoints in origin/destination (not `location`).
      const from = i.origin?.trim() ?? ''
      const to = i.destination?.trim() ?? ''
      if (from && to) {
        out.push({
          id: i.id,
          key: `${i.id}:from`,
          label: i.title,
          location: from,
          done,
          feature,
          role: 'from',
        })
        out.push({
          id: i.id,
          key: `${i.id}:to`,
          label: i.title,
          location: to,
          done,
          feature,
          role: 'to',
        })
        feature++
      } else if (from || to) {
        // Only one end known — fall back to a single pin at whichever we have.
        out.push({
          id: i.id,
          key: i.id,
          label: i.title,
          location: from || to,
          done,
          feature,
          role: 'point',
        })
        feature++
      }
      continue
    }
    if (!i.location) continue
    out.push({
      id: i.id,
      key: i.id,
      label: i.title,
      location: i.location,
      done,
      feature,
      role: 'point',
    })
    feature++
  }

  return out
}

// collectLocations is the flat list of location strings passed to fetchDayRoute,
// in the same order as collectLocatedItems so returned waypoints line up
// positionally with located items (all entries are non-empty; the server drops
// any it can't resolve).
export function collectLocations(day: Pick<Day, 'stays' | 'plan_items'>): string[] {
  return collectLocatedItems(day).map((i) => i.location)
}

// FeatureInfo is one numbered itinerary unit (a legend/badge entry). A transport
// leg is a single feature (`transport: true`) spanning two located points.
export interface FeatureInfo {
  id: string
  number: number
  label: string
  done: boolean
  transport: boolean
}

// featureList collapses expanded located points back into their numbered
// features, in order — used by the map pin legend and the plan-list badges,
// which want one entry per item even though a leg has two located points.
export function featureList(items: LocatedItem[]): FeatureInfo[] {
  const seen = new Map<number, FeatureInfo>()
  for (const it of items) {
    const existing = seen.get(it.feature)
    if (existing) {
      if (it.role !== 'point') existing.transport = true
      continue
    }
    seen.set(it.feature, {
      id: it.id,
      number: it.feature + 1,
      label: it.label,
      done: it.done,
      transport: it.role !== 'point',
    })
  }
  return [...seen.values()].sort((a, b) => a.number - b.number)
}

// RenderFeature is a map-ready feature with resolved coordinates: a numbered
// ball at `anchor` plus, for a transport leg, its two endpoints (`ends`) so the
// map can drop a small marker on each end. For a plain point `ends` is empty and
// `anchor` is that point; for a leg `anchor` is the midpoint of its two ends so
// the number sits on the route arrow between them.
export interface RenderFeatureEnd {
  role: 'from' | 'to'
  coord: LatLng
  location: string
}
export interface RenderFeature {
  id: string
  number: number
  label: string
  done: boolean
  anchor: LatLng
  ends: RenderFeatureEnd[]
}

// buildFeatures pairs expanded located points with their geocoded waypoints
// (aligned positionally) and groups them into render features. A transport leg
// (a 'from' + 'to' sharing a feature) becomes one numbered ball at the midpoint
// with an endpoint marker on each end; every other point becomes a single
// numbered ball. Points whose waypoint didn't resolve are skipped.
export function buildFeatures(items: LocatedItem[], waypoints: LatLng[]): RenderFeature[] {
  const groups = new Map<
    number,
    { item: LocatedItem; point?: LatLng; from?: RenderFeatureEnd; to?: RenderFeatureEnd }
  >()
  items.forEach((it, i) => {
    const wp = waypoints[i]
    if (!wp) return
    const g = groups.get(it.feature) ?? { item: it }
    if (it.role === 'from') g.from = { role: 'from', coord: wp, location: it.location }
    else if (it.role === 'to') g.to = { role: 'to', coord: wp, location: it.location }
    else g.point = wp
    groups.set(it.feature, g)
  })

  const features: RenderFeature[] = []
  for (const [feature, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (g.from && g.to) {
      features.push({
        id: g.item.id,
        number: feature + 1,
        label: g.item.label,
        done: g.item.done,
        anchor: {
          lat: (g.from.coord.lat + g.to.coord.lat) / 2,
          lng: (g.from.coord.lng + g.to.coord.lng) / 2,
        },
        ends: [g.from, g.to],
      })
      continue
    }
    // A plain point, or a leg with only one resolvable end: a single ball.
    const coord = g.point ?? g.from?.coord ?? g.to?.coord
    if (!coord) continue
    features.push({
      id: g.item.id,
      number: feature + 1,
      label: g.item.label,
      done: g.item.done,
      anchor: coord,
      ends: [],
    })
  }
  return features
}
