import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiBaseURL, webBaseURL } from '../env'
import { signInIdentity, type SignedInIdentity } from '../lib/identities'

// Role-based access E2E (M10.2 S1): prove the server-side authorization guarantee
// (Milestone 08, PRD §5.9/§6) end to end on a shared trip —
//   • an Editor can edit plan / budget / journal,
//   • a Viewer is read-only (can read, writes are rejected),
//   • a non-member is denied (cannot even read).
//
// The proof is at the API: the assertions hit the deployed backend directly as
// each identity, because a hidden UI control is not sufficient evidence that
// access is enforced (PRD §5.9). Deny-by-default returns 404 (trip_not_found)
// rather than 403 across trip/budget/journal so trip existence is never leaked —
// so "denied" here means 404. One UI assertion complements this: the sharing
// page's owner-only management affordances are absent for the Viewer.
//
// Setup uses the real invite → accept flow: the owner invites the Editor and
// Viewer by the exact emails those identities provisioned under, then each
// accepts via the opaque token (surfaced on the owner-only list on the E2E env).
// The non-member is never invited. The trip (with all cascaded data) is deleted
// in afterAll so reruns stay clean.

const runId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
const tripName = `E2E Roles ${runId}`

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Span today..+3 so the day is "current" and its planning surfaces are editable.
const today = new Date()
const startDate = isoDate(today)
const endDate = isoDate(new Date(today.getTime() + 3 * 86_400_000))

let owner: SignedInIdentity
let editor: SignedInIdentity
let viewer: SignedInIdentity
let nonmember: SignedInIdentity
let tripId: string
let dayId: string

// invite creates an invitation for email at role, owner-only.
async function invite(
  ctx: APIRequestContext,
  email: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const res = await ctx.post(`${apiBaseURL}/trips/${tripId}/invitations`, { data: { email, role } })
  expect(res.ok(), `invite ${email} as ${role}: HTTP ${res.status()}`).toBeTruthy()
}

// acceptInvite accepts the invitation for the given identity via its token.
async function acceptInvite(
  who: SignedInIdentity,
  tokensByEmail: Record<string, string>,
): Promise<void> {
  const token = tokensByEmail[who.email]
  expect(
    token,
    `no invitation token for ${who.email} — is ExposeInviteTokens enabled on the target? (M10.2)`,
  ).toBeTruthy()
  const res = await who.ctx.post(`${apiBaseURL}/invite/accept?token=${token}`)
  expect(res.ok(), `accept invite for ${who.email}: HTTP ${res.status()}`).toBeTruthy()
}

test.beforeAll(async () => {
  owner = await signInIdentity('owner')
  editor = await signInIdentity('editor')
  viewer = await signInIdentity('viewer')
  nonmember = await signInIdentity('nonmember')

  // Owner creates the trip (its owner membership is written server-side in the
  // same transaction), then we resolve today's generated day id.
  const createRes = await owner.ctx.post(`${apiBaseURL}/trips`, {
    data: {
      name: tripName,
      destinations: ['Lisbon'],
      start_date: startDate,
      end_date: endDate,
      cover: '',
    },
  })
  expect(createRes.ok(), `create trip: HTTP ${createRes.status()}`).toBeTruthy()
  tripId = ((await createRes.json()) as { id: string }).id

  const dayRes = await owner.ctx.get(`${apiBaseURL}/trips/${tripId}/days/${startDate}`)
  expect(dayRes.ok(), `resolve day: HTTP ${dayRes.status()}`).toBeTruthy()
  dayId = ((await dayRes.json()) as { id: string }).id

  // Real invite → accept: owner invites, then each invitee accepts via its token.
  await invite(owner.ctx, editor.email, 'editor')
  await invite(owner.ctx, viewer.email, 'viewer')

  const listRes = await owner.ctx.get(`${apiBaseURL}/trips/${tripId}/invitations`)
  expect(listRes.ok(), `list invitations: HTTP ${listRes.status()}`).toBeTruthy()
  const { invitations } = (await listRes.json()) as {
    invitations: Array<{ email: string; token?: string }>
  }
  const tokensByEmail: Record<string, string> = {}
  for (const inv of invitations) {
    if (inv.token) tokensByEmail[inv.email] = inv.token
  }
  await acceptInvite(editor, tokensByEmail)
  await acceptInvite(viewer, tokensByEmail)
})

test.afterAll(async () => {
  // Owner deletes the trip (cascades to days, plan items, costs, journal,
  // memberships, invitations) so reruns stay clean, then dispose every context.
  if (tripId && owner) {
    await owner.ctx.delete(`${apiBaseURL}/trips/${tripId}`).catch(() => {})
  }
  for (const who of [owner, editor, viewer, nonmember]) {
    await who?.ctx.dispose()
  }
})

test('editor can edit plan, budget, and journal (server accepts writes)', async () => {
  const plan = await editor.ctx.post(`${apiBaseURL}/trips/${tripId}/plan-items`, {
    data: { title: `Editor plan ${runId}`, day_id: dayId },
  })
  expect(plan.status(), 'editor plan-item create should be allowed').toBe(201)

  const cost = await editor.ctx.post(`${apiBaseURL}/trips/${tripId}/cost-entries`, {
    data: { day_id: dayId, category: 'Other', amount: 12.5, note: `Editor cost ${runId}` },
  })
  expect(cost.status(), 'editor cost create should be allowed').toBe(201)

  const journal = await editor.ctx.put(`${apiBaseURL}/trips/${tripId}/days/${dayId}/journal`, {
    data: { body: { text: `Editor journal ${runId}` }, rating: null, weather: '', mood: '' },
  })
  expect(
    journal.ok(),
    `editor journal upsert should be allowed: HTTP ${journal.status()}`,
  ).toBeTruthy()
})

test('viewer can read but every write is rejected server-side', async () => {
  // Read is allowed.
  const day = await viewer.ctx.get(`${apiBaseURL}/trips/${tripId}/days/${startDate}`)
  expect(day.status(), 'viewer should be able to read the day').toBe(200)

  // Writes are rejected (deny-by-default → 404, no existence leak).
  const plan = await viewer.ctx.post(`${apiBaseURL}/trips/${tripId}/plan-items`, {
    data: { title: `Viewer plan ${runId}`, day_id: dayId },
  })
  expect(plan.status(), 'viewer plan-item create must be rejected').toBe(404)

  const cost = await viewer.ctx.post(`${apiBaseURL}/trips/${tripId}/cost-entries`, {
    data: { day_id: dayId, category: 'Other', amount: 5 },
  })
  expect(cost.status(), 'viewer cost create must be rejected').toBe(404)

  const journal = await viewer.ctx.put(`${apiBaseURL}/trips/${tripId}/days/${dayId}/journal`, {
    data: { body: { text: `Viewer journal ${runId}` } },
  })
  expect(journal.status(), 'viewer journal upsert must be rejected').toBe(404)
})

test('non-member is denied — cannot read or write', async () => {
  const day = await nonmember.ctx.get(`${apiBaseURL}/trips/${tripId}/days/${startDate}`)
  expect(day.status(), 'non-member must not read the day').toBe(404)

  const cost = await nonmember.ctx.post(`${apiBaseURL}/trips/${tripId}/cost-entries`, {
    data: { day_id: dayId, category: 'Other', amount: 5 },
  })
  expect(cost.status(), 'non-member write must be rejected').toBe(404)
})

test('viewer sees the sharing page read-only (no owner-only management affordance)', async ({
  browser,
}) => {
  // Complement the API proof with a UI check on the one surface that gates by
  // role: the sharing page hides its management controls for non-owners. Loaded
  // as the Viewer, the members list is visible (read) but the owner-only "Invite
  // someone" region is absent (no edit affordance).
  const state = await viewer.ctx.storageState()
  const context = await browser.newContext({ baseURL: webBaseURL, storageState: state })
  try {
    const page = await context.newPage()
    await page.goto(`/trips/${tripId}/sharing`)
    await expect(page.getByRole('region', { name: 'Members' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Invite someone' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
