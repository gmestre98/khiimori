import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apiFetch,
  setUnauthorizedHandler,
  reorderPlanItems,
  movePlanItem,
  promotePlanItem,
  demotePlanItem,
  setPlanItemStatus,
} from './api'

afterEach(() => {
  setUnauthorizedHandler(null)
  vi.restoreAllMocks()
})

describe('apiFetch 401 interceptor', () => {
  it('sends credentials and invokes the unauthorized handler on 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 401 }))

    await apiFetch('/me')

    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe('include')
  })

  it('does not invoke the handler on a 2xx response', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    await apiFetch('/me')

    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('does not invoke the handler on a non-401 error response', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))

    await apiFetch('/me')

    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('reorderPlanItems', () => {
  it('posts day_id and item_ids to the reorder endpoint', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }))

    await reorderPlanItems('trip-1', 'day-1', ['a', 'b', 'c'])

    expect(spy).toHaveBeenCalledOnce()
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/trips/trip-1/plan-items/reorder')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ day_id: 'day-1', item_ids: ['a', 'b', 'c'] })
  })

  it('throws UnauthorizedError on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    await expect(reorderPlanItems('trip-1', 'day-1', [])).rejects.toMatchObject({
      name: 'UnauthorizedError',
    })
  })
})

describe('movePlanItem', () => {
  it('posts day_id to the move endpoint', async () => {
    const item = { id: 'item-1', trip_id: 'trip-1', title: 'T', sort_order: 0, status: 'planned' }
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(item), { status: 200 }))

    await movePlanItem('trip-1', 'item-1', 'day-2')

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/trips/trip-1/plan-items/item-1/move')
    expect(JSON.parse(init.body as string)).toEqual({ day_id: 'day-2' })
  })
})

describe('promotePlanItem', () => {
  it('posts day_id to the promote endpoint', async () => {
    const item = { id: 'item-1', trip_id: 'trip-1', title: 'T', sort_order: 0, status: 'planned' }
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(item), { status: 200 }))

    await promotePlanItem('trip-1', 'item-1', 'day-1')

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/trips/trip-1/plan-items/item-1/promote')
    expect(JSON.parse(init.body as string)).toEqual({ day_id: 'day-1' })
  })
})

describe('demotePlanItem', () => {
  it('posts to the demote endpoint', async () => {
    const item = { id: 'item-1', trip_id: 'trip-1', title: 'T', sort_order: 0, status: 'planned' }
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(item), { status: 200 }))

    await demotePlanItem('trip-1', 'item-1')

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/trips/trip-1/plan-items/item-1/demote')
    expect(init.method).toBe('POST')
  })
})

describe('setPlanItemStatus', () => {
  it('posts the status to the status endpoint', async () => {
    const item = { id: 'item-1', trip_id: 'trip-1', title: 'T', sort_order: 0, status: 'done' }
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(item), { status: 200 }))

    await setPlanItemStatus('trip-1', 'item-1', 'done')

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/trips/trip-1/plan-items/item-1/status')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'done' })
  })
})
