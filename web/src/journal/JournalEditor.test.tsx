import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { JournalEditor } from './JournalEditor'
import * as api from '../lib/api'
import type { JournalEntry } from '../lib/api'
import { writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchJournalEntry: vi.fn(),
    upsertJournalEntry: vi.fn(),
    listPhotos: vi.fn(),
    fetchTripUsage: vi.fn(),
  }
})

function makeEntry(body: string): JournalEntry {
  return {
    id: 'entry-1',
    day_id: 'day-1',
    author_id: 'user-1',
    body,
    rating: null,
    weather: '',
    mood: '',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }
}

// Host re-renders (and hands JournalEditor a brand-new onEntryChange closure)
// every time onEntryChange fires — exactly what the trip Journal subtab does
// when a save triggers reloadDay -> setSummaries. A stable identity is not
// assumed by the editor.
function UnstableHost() {
  const [ticks, setTicks] = useState(0)
  return (
    <div>
      <span data-testid="ticks">{ticks}</span>
      <JournalEditor tripId="trip-1" dayId="day-1" onEntryChange={() => setTicks((t) => t + 1)} />
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.mocked(api.fetchJournalEntry).mockResolvedValue(makeEntry(''))
  vi.mocked(api.upsertJournalEntry).mockImplementation(async (_t, _d, input) =>
    makeEntry(input.body ?? ''),
  )
  vi.mocked(api.listPhotos).mockResolvedValue([])
  vi.mocked(api.fetchTripUsage).mockResolvedValue({
    used_bytes: 0,
    cap_bytes: 1_000_000_000,
    near_cap: false,
    used_pct: 0,
  })
})

describe('JournalEditor onEntryChange', () => {
  it('does not loop when the host passes an unstable onEntryChange', async () => {
    const user = userEvent.setup()
    render(<UnstableHost />)

    const textarea = await screen.findByRole('textbox', { name: 'Journal entry' })
    await user.type(textarea, 'Hi')

    // Auto-save debounces at 800ms; wait for the single save to land.
    await waitFor(() => expect(api.upsertJournalEntry).toHaveBeenCalled())
    // The save fires onEntryChange, which re-renders the host with a fresh
    // closure. If that identity re-armed the debounce, a new save would fire
    // ~every 800ms forever. Wait past several cycles and assert the content
    // settled to exactly one save.
    await new Promise((r) => setTimeout(r, 2500))
    expect(vi.mocked(api.upsertJournalEntry)).toHaveBeenCalledTimes(1)
  })
})

describe('JournalEditor instant-render cache (M11.1)', () => {
  it('renders a cached entry instantly, before the network responds', async () => {
    await writeCache(cacheKeys.journal('trip-1', 'day-1'), makeEntry('Cached thoughts'))
    // Network hangs: only the cache can satisfy the first paint.
    vi.mocked(api.fetchJournalEntry).mockReturnValue(new Promise<JournalEntry>(() => {}))

    render(<JournalEditor tripId="trip-1" dayId="day-1" />)

    const textarea = await screen.findByRole('textbox', { name: 'Journal entry' })
    expect(textarea).toHaveValue('Cached thoughts')
  })

  it('hydrating from cache + fetch does not trigger an auto-save', async () => {
    await writeCache(cacheKeys.journal('trip-1', 'day-1'), makeEntry('Loaded body'))
    vi.mocked(api.fetchJournalEntry).mockResolvedValue(makeEntry('Loaded body'))

    render(<JournalEditor tripId="trip-1" dayId="day-1" />)
    await screen.findByDisplayValue('Loaded body')

    // Wait past the 800 ms debounce: loading (cache seed + fetch) is not a user
    // edit, so nothing should be saved.
    await new Promise((r) => setTimeout(r, 1000))
    expect(api.upsertJournalEntry).not.toHaveBeenCalled()
  })
})
