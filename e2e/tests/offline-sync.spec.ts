import { test, expect, request as playwrightRequest } from '@playwright/test'
import { apiBaseURL, storageStatePath } from '../env'

// Offline → online sync E2E (M10.2 S2): prove that plan and journal edits made
// while offline queue locally and reconcile on reconnect with no loss or
// duplication (PRD §6, Milestones 04/06/09).
//
// It drives the REAL shared offline mechanism, not a mock: Playwright takes the
// browser context offline (context.setOffline), the app's own write queue
// (IndexedDB) captures the edits, and the app's reconnect replay (the window
// 'online' listener wired by the authenticated shell's SyncStatus) flushes them
// when the context comes back online. The assertions then read the deployed API
// directly to confirm the server reflects each edit exactly once.
//
// Sign-in is the shared session (auth.setup → storageState). A unique run id
// scopes the data and the trip (with all cascaded data) is deleted in afterAll,
// so reruns stay clean.

const runId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
const tripName = `E2E Offline ${runId}`
const planTitle = `Offline plan ${runId}`
const journalText = `Offline journal ${runId}`

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Span today..+3 so the day is "current" and its plan/journal are editable.
const today = new Date()
const startDate = isoDate(today)
const endDate = isoDate(new Date(today.getTime() + 3 * 86_400_000))

let createdTripId: string | null = null
let dayId: string | null = null

test.afterAll(async () => {
  if (!createdTripId) return
  // A fresh API context authenticated by the same saved session — afterAll can't
  // use the test-scoped `request` fixture.
  const ctx = await playwrightRequest.newContext({ storageState: storageStatePath })
  try {
    await ctx.delete(`${apiBaseURL}/trips/${createdTripId}`)
  } finally {
    await ctx.dispose()
  }
})

test('offline plan + journal edits sync on reconnect with no loss or duplication', async ({
  page,
  request,
}) => {
  // Room for a scale-to-zero cold start plus the debounced saves and replay.
  test.setTimeout(120_000)

  await test.step('create the trip and resolve today’s day (API)', async () => {
    const createRes = await request.post(`${apiBaseURL}/trips`, {
      data: {
        name: tripName,
        destinations: ['Lisbon'],
        start_date: startDate,
        end_date: endDate,
        cover: '',
      },
    })
    expect(createRes.ok(), `create trip: HTTP ${createRes.status()}`).toBeTruthy()
    createdTripId = ((await createRes.json()) as { id: string }).id

    const dayRes = await request.get(`${apiBaseURL}/trips/${createdTripId}/days/${startDate}`)
    expect(dayRes.ok(), `resolve day: HTTP ${dayRes.status()}`).toBeTruthy()
    dayId = ((await dayRes.json()) as { id: string }).id
  })

  const planning = page.getByRole('region', { name: 'Planning' })
  const journal = page.getByRole('region', { name: 'Journal' })

  await test.step('open the day and go offline', async () => {
    // Arm the wait before navigating so we catch the journal fetch the editor
    // fires on mount. The journal editor only becomes save-capable once that load
    // resolves (its auto-save is gated on loadedDayId === dayId). If we go offline
    // while it is still in flight, the fetch resolves as a synthetic offline 503,
    // the editor stays un-loaded, and the offline edit never queues. Real users
    // open a day online, let it load, then go offline — wait for that here so the
    // test exercises the same path (and isn't sensitive to API round-trip latency).
    const journalLoaded = page.waitForResponse((r) => /\/days\/[^/]+\/journal(\?|$)/.test(r.url()))
    await page.goto(`/trips/${createdTripId}/days/${startDate}`)
    await expect(planning.getByLabel('Title', { exact: true })).toBeVisible()
    await journalLoaded

    await page.context().setOffline(true)
    // The app registers the offline state before we start editing.
    await expect(page.getByRole('status').filter({ hasText: /You’re offline/ })).toBeVisible()
  })

  await test.step('make a plan edit while offline (queued locally)', async () => {
    await planning.getByLabel('Title', { exact: true }).fill(planTitle)
    await planning.getByRole('button', { name: 'Add', exact: true }).click()
    // The queued write is reflected optimistically in the plan.
    await expect(planning.getByText(planTitle)).toBeVisible()
  })

  await test.step('make a journal edit while offline (queued locally)', async () => {
    await journal.getByLabel('Journal entry').fill(journalText)
    // The save status confirms the write was queued offline (not saved online).
    await expect(journal.getByText('Queued — will sync when online')).toBeVisible({
      timeout: 20_000,
    })
  })

  await test.step('reconnect — the app replays the queue', async () => {
    await page.context().setOffline(false)
  })

  await test.step('server reflects both edits exactly once (no loss / no duplication)', async () => {
    // Exactly one plan item with our unique title — proves it synced and was not
    // duplicated by the replay. Polled via the `request` fixture (a separate
    // context, unaffected by the page's offline toggling).
    await expect
      .poll(
        async () => {
          const res = await request.get(`${apiBaseURL}/trips/${createdTripId}/days/${startDate}`)
          if (!res.ok()) return -1
          const body = (await res.json()) as { plan_items: Array<{ title: string }> }
          return body.plan_items.filter((p) => p.title === planTitle).length
        },
        { timeout: 30_000, message: 'offline plan edit did not sync exactly once' },
      )
      .toBe(1)

    // The journal upsert (idempotent by day) reflects our text on the server.
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${apiBaseURL}/trips/${createdTripId}/days/${dayId}/journal`,
          )
          if (!res.ok()) return ''
          const body = (await res.json()) as { body: { text?: string } | string }
          return typeof body.body === 'string' ? body.body : (body.body?.text ?? '')
        },
        { timeout: 30_000, message: 'offline journal edit did not sync' },
      )
      .toBe(journalText)
  })
})
