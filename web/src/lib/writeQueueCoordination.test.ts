import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock M04's queue + replay engine so we test only the coordination wiring,
// not the (separately tested) queue semantics.
vi.mock('./mutationQueue', () => ({
  getAll: vi.fn(),
}))
vi.mock('./replayQueue', async () => {
  const actual = await vi.importActual<typeof import('./replayQueue')>('./replayQueue')
  return {
    ...actual,
    replayQueue: vi.fn(),
    startReplayOnReconnect: vi.fn(),
    stopReplayOnReconnect: vi.fn(),
  }
})

import { getAll } from './mutationQueue'
import { replayQueue, startReplayOnReconnect, stopReplayOnReconnect } from './replayQueue'
import { startWriteQueueCoordination } from './writeQueueCoordination'

const mockGetAll = vi.mocked(getAll)
const mockReplay = vi.mocked(replayQueue)
const mockStart = vi.mocked(startReplayOnReconnect)
const mockStop = vi.mocked(stopReplayOnReconnect)

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAll.mockResolvedValue([])
  mockReplay.mockResolvedValue([])
})

afterEach(() => {
  setOnline(true)
})

describe('startWriteQueueCoordination', () => {
  it('registers the reconnect replay listener (M04 mechanism, reused)', () => {
    setOnline(false)
    startWriteQueueCoordination()
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  it('returns the teardown that stops the reconnect listener', () => {
    setOnline(false)
    const stop = startWriteQueueCoordination()
    expect(stop).toBe(mockStop)
  })

  it('does NOT cold-start drain when offline', async () => {
    setOnline(false)
    startWriteQueueCoordination()
    await Promise.resolve()
    expect(mockGetAll).not.toHaveBeenCalled()
    expect(mockReplay).not.toHaveBeenCalled()
  })

  it('does NOT replay on cold start when the queue is empty', async () => {
    setOnline(true)
    mockGetAll.mockResolvedValue([])
    startWriteQueueCoordination()
    await vi.waitFor(() => expect(mockGetAll).toHaveBeenCalled())
    expect(mockReplay).not.toHaveBeenCalled()
  })

  it('replays on cold start when online with pending writes', async () => {
    setOnline(true)
    mockGetAll.mockResolvedValue([
      { id: '1', seq: 1, kind: 'createPlanItem', payload: {}, enqueuedAt: '' },
    ])
    const onReplay = vi.fn()
    mockReplay.mockResolvedValue([{ id: '1', seq: 1, kind: 'createPlanItem', outcome: 'success' }])
    startWriteQueueCoordination(onReplay)
    await vi.waitFor(() => expect(mockReplay).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(onReplay).toHaveBeenCalled())
  })
})
