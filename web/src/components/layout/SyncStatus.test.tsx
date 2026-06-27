import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReplayResult } from '../../lib/replayQueue'

// Capture the callbacks SyncStatus passes to the coordination layer so the test
// can drive replay outcomes without touching the real queue.
const handlers: {
  onReplay?: (r: ReplayResult[]) => void
  onError?: () => void
} = {}
const stop = vi.fn()

vi.mock('../../lib/writeQueueCoordination', () => ({
  startWriteQueueCoordination: (onReplay: (r: ReplayResult[]) => void, onError: () => void) => {
    handlers.onReplay = onReplay
    handlers.onError = onError
    return stop
  },
}))

import { SyncStatus } from './SyncStatus'

afterEach(() => {
  cleanup()
})

describe('SyncStatus', () => {
  it('renders nothing in the steady state', () => {
    const { container } = render(<SyncStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces how many changes synced on a successful replay', () => {
    render(<SyncStatus />)
    act(() => {
      handlers.onReplay?.([
        { id: '1', seq: 1, kind: 'createPlanItem', outcome: 'success' },
        { id: '2', seq: 2, kind: 'updatePlanItem', outcome: 'success' },
      ])
    })
    expect(screen.getByRole('status')).toHaveTextContent('Synced 2 changes.')
  })

  it('shows a retry notice when replay had transient failures', () => {
    render(<SyncStatus />)
    act(() => {
      handlers.onError?.()
    })
    expect(screen.getByRole('status')).toHaveTextContent(/retry/i)
  })

  it('tears down the coordination on unmount', () => {
    const { unmount } = render(<SyncStatus />)
    unmount()
    expect(stop).toHaveBeenCalled()
  })
})
