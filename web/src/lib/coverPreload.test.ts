import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripsResponse } from './api'
import { apiUrl } from './api'
import {
  _resetCoverPreloadForTesting,
  coverSrc,
  preloadCachedCovers,
  preloadCovers,
} from './coverPreload'
import { readCache } from './resourceCache'

vi.mock('./resourceCache', () => ({ readCache: vi.fn() }))

const trip = (id: string, cover_url: string, cover = ''): Trip =>
  ({ id, name: id, destinations: [], cover, cover_url }) as unknown as Trip

describe('coverSrc', () => {
  it('maps an API cover path onto the API base and passes other URLs through', () => {
    expect(coverSrc(trip('a', '/trips/a/cover/0123456789ab'))).toBe(
      apiUrl('/trips/a/cover/0123456789ab'),
    )
    expect(coverSrc(trip('b', 'https://cdn.example/x.jpg'))).toBe('https://cdn.example/x.jpg')
    expect(coverSrc(trip('c', '', 'https://cdn.example/y.jpg'))).toBe('https://cdn.example/y.jpg')
    expect(coverSrc(trip('d', '', 'gs://bucket/x'))).toBe('')
    expect(coverSrc(trip('e', ''))).toBe('')
  })
})

describe('preloadCovers', () => {
  beforeEach(() => {
    _resetCoverPreloadForTesting()
    document.head.querySelectorAll('link[rel="preload"]').forEach((l) => l.remove())
  })
  afterEach(() => vi.mocked(readCache).mockReset())

  const links = () =>
    [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].map(
      (l) => [l.getAttribute('href'), l.getAttribute('fetchpriority')],
    )

  it('preloads current, then upcoming, then past covers at high priority, once', () => {
    const list: TripsResponse = {
      current: [trip('now', '/trips/now/cover/aaaaaaaaaaaa')],
      upcoming: [trip('next', 'https://cdn.example/next.jpg'), trip('nocover', '')],
      past: [trip('old', '/trips/old/cover/bbbbbbbbbbbb')],
    }
    preloadCovers(list)
    preloadCovers(list)
    expect(links()).toEqual([
      [apiUrl('/trips/now/cover/aaaaaaaaaaaa'), 'high'],
      ['https://cdn.example/next.jpg', 'high'],
      [apiUrl('/trips/old/cover/bbbbbbbbbbbb'), 'high'],
    ])
  })

  it('starts covers from the saved trips list at boot', async () => {
    vi.mocked(readCache).mockResolvedValue({
      data: { current: [trip('now', '/trips/now/cover/cccccccccccc')], upcoming: [], past: [] },
    } as never)
    await preloadCachedCovers()
    expect(links()).toEqual([[apiUrl('/trips/now/cover/cccccccccccc'), 'high']])
  })

  it('does nothing without a saved list', async () => {
    vi.mocked(readCache).mockResolvedValue(null as never)
    await preloadCachedCovers()
    expect(links()).toEqual([])
  })
})
