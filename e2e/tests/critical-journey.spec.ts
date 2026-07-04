import { test, expect, request as playwrightRequest } from '@playwright/test'
import { apiBaseURL, storageStatePath } from '../env'

// The headline end-to-end proof (M10.1 S2): one signed-in user drives the full
// journey across every module —
//   sign in → create trip → plan a day → add a budget → write a journal → share
// — against the DEPLOYED app, asserting a real, persisted outcome at each step
// (not just that a click happened). Sign-in is provided by the shared session
// (auth.setup → storageState), so this spec starts authenticated.
//
// Determinism: a unique run id scopes the trip name and guest email so parallel
// or repeated runs never collide, and the trip (with all its cascaded data) is
// deleted via the API in afterAll — so reruns stay clean even if a step fails
// midway.

// A short, unique-per-run id keeps test data isolated and greppable.
const runId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
const tripName = `E2E Journey ${runId}`
const guestEmail = `e2e-guest-${runId}@khiimori.test`
const planTitle = `Visit the castle ${runId}`
const costNote = `Castle ticket ${runId}`
const journalText = `A wonderful first day (${runId}).`

// pad2 / isoDate format a Date as YYYY-MM-DD in local time (matching the date
// inputs and the server's day generation).
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// The trip spans today..+3 days: today makes it the "current" trip and keeps the
// journal editable (journals go read-only once a trip is in the past).
const today = new Date()
const startDate = isoDate(today)
const endDate = isoDate(new Date(today.getTime() + 3 * 86_400_000))

// Captured after creation so afterAll can delete the trip (cascades to days,
// plan items, costs, journal, invitation). Null until the trip exists, so a
// failure before creation leaves nothing to clean up.
let createdTripId: string | null = null

test.afterAll(async () => {
  if (!createdTripId) return
  // A fresh API context authenticated by the same saved session — afterAll can't
  // use the test-scoped `request` fixture.
  const ctx = await playwrightRequest.newContext({ storageState: storageStatePath })
  try {
    // Delete every trip carrying this run's unique name, not just the one id — a
    // retry re-runs the create step and would otherwise leave a duplicate behind.
    // The name embeds the unique run id, so this only ever matches this run.
    const res = await ctx.get(`${apiBaseURL}/trips`)
    if (res.ok()) {
      const body = (await res.json()) as {
        current: Array<{ id: string; name: string }>
        upcoming: Array<{ id: string; name: string }>
        past: Array<{ id: string; name: string }>
      }
      const mine = [...body.current, ...body.upcoming, ...body.past].filter(
        (t) => t.name === tripName,
      )
      for (const t of mine) {
        await ctx.delete(`${apiBaseURL}/trips/${t.id}`)
      }
    }
  } finally {
    await ctx.dispose()
  }
})

test('critical journey: create trip → plan → budget → journal → share', async ({
  page,
  request,
}) => {
  // One long flow; give it room for a scale-to-zero cold start. Called inside the
  // test (where there is a running test) so the override actually applies — a
  // module-scope test.setTimeout would not.
  test.setTimeout(120_000)

  await test.step('signed in and landed on the app', async () => {
    await page.goto('/')
    // The shared session means we are not bounced to sign-in.
    await expect(page.getByRole('button', { name: /sign in with google/i })).toHaveCount(0)
  })

  await test.step('create a trip', async () => {
    await page.goto('/trips/new')
    await page.getByLabel('Name').fill(tripName)
    await page.getByLabel('Destinations').fill('Lisbon')
    await page.getByLabel('Start date').fill(startDate)
    await page.getByLabel('End date').fill(endDate)
    await page.getByRole('button', { name: 'Create trip' }).click()

    // Real outcome: the created trip is now listed on the dashboard.
    await expect(page.getByText(tripName)).toBeVisible()

    // Resolve the trip id from the API (authenticated by the shared session) so
    // the following steps can deep-link to it deterministically.
    const res = await request.get(`${apiBaseURL}/trips`)
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as {
      current: Array<{ id: string; name: string }>
      upcoming: Array<{ id: string; name: string }>
      past: Array<{ id: string; name: string }>
    }
    const all = [...body.current, ...body.upcoming, ...body.past]
    const trip = all.find((t) => t.name === tripName)
    expect(trip, 'created trip not found in GET /trips').toBeTruthy()
    createdTripId = trip!.id
  })

  await test.step('plan a day — add a plan item', async () => {
    await page.goto(`/trips/${createdTripId}/days/${startDate}`)
    // Scope to the Planning facet so the shared "Title"/"Add" labels are
    // unambiguous across the day's four sections.
    const planning = page.getByRole('region', { name: 'Planning' })
    await planning.getByLabel('Title', { exact: true }).fill(planTitle)
    await planning.getByRole('button', { name: 'Add', exact: true }).click()

    // Real outcome: the item is persisted and shown in the day's plan.
    await expect(planning.getByText(planTitle)).toBeVisible()
  })

  await test.step('add a budget — log a cost', async () => {
    const budget = page.getByRole('region', { name: 'Budget' })
    await budget.getByRole('button', { name: /log cost/i }).click()
    const costForm = budget.getByRole('form', { name: 'Log a cost' })
    await costForm.getByLabel('Amount in EUR').fill('42.50')
    await costForm.getByLabel('Note').fill(costNote)
    await costForm.getByRole('button', { name: 'Log', exact: true }).click()

    // Real outcome: the cost entry appears in the day's cost list.
    await expect(
      budget.getByRole('list', { name: 'Cost entries' }).getByText(costNote),
    ).toBeVisible()
  })

  await test.step('write a journal entry', async () => {
    const journal = page.getByRole('region', { name: 'Journal' })
    await journal.getByLabel('Journal entry').fill(journalText)

    // Real outcome: the auto-save confirms the entry persisted online (not just
    // queued offline).
    await expect(journal.getByText('Saved', { exact: true })).toBeVisible({ timeout: 20_000 })
  })

  await test.step('share the trip — send an invitation', async () => {
    await page.goto(`/trips/${createdTripId}/sharing`)
    // Scope to the invite card so "Role" can't collide with the "Roles" legend
    // section (getByLabel is a substring match); `exact` pins the invite select.
    const invite = page.getByRole('region', { name: 'Invite someone' })
    await invite.getByLabel('Email address').fill(guestEmail)
    await invite.getByLabel('Role', { exact: true }).selectOption('viewer')
    await invite.getByRole('button', { name: 'Send Invite' }).click()

    // Real outcome: the invitation is persisted and listed as pending.
    await expect(
      page.getByRole('region', { name: 'Pending invitations' }).getByText(guestEmail),
    ).toBeVisible()
  })
})
