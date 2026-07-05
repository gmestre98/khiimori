// Multi-identity test sign-in for the role-based-access E2E (M10.2 S1).
//
// Epic 01's auth.setup signs in a single fixed identity (the "owner"). The role
// suite needs four: an owner, an invited Editor, an invited Viewer, and a
// non-member — to prove server-side authorization (Editor edits, Viewer is
// read-only, non-member is denied).
//
// Each is minted through the same guarded endpoint the harness already uses
// (POST /auth/test-login, only present when E2E_LOGIN_SECRET is configured),
// passing ?identity=<name> to select one of the backend's fixed, non-admin test
// identities. The returned APIRequestContext carries that identity's session
// cookie, so the spec can drive the real API as each user and assert enforcement
// at the server (a hidden UI control is not sufficient evidence, PRD §5.9).

import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { apiBaseURL, e2eLoginSecret, e2eLoginSecretHeader } from '../env'

// IdentityName mirrors the backend allowlist (auth.e2eTestIdentities).
export type IdentityName = 'owner' | 'editor' | 'viewer' | 'nonmember'

// SignedInIdentity bundles an authenticated API context with the identity's ids.
// `ctx` holds the session cookie; dispose it when done (the spec's afterAll).
export interface SignedInIdentity {
  name: IdentityName
  ctx: APIRequestContext
  userId: string
  // The verified email the backend provisioned this identity under — the owner
  // invites the Editor/Viewer by this exact address so the accept matches.
  email: string
}

// signInIdentity mints a fresh, authenticated API context for the named identity
// via the guarded test-login endpoint. Throws a descriptive error if the endpoint
// is not enabled on the target or the secret mismatches.
export async function signInIdentity(name: IdentityName): Promise<SignedInIdentity> {
  const ctx = await playwrightRequest.newContext({ baseURL: apiBaseURL })
  const res = await ctx.post(`/auth/test-login?identity=${name}`, {
    headers: { [e2eLoginSecretHeader]: e2eLoginSecret() },
  })
  if (!res.ok()) {
    await ctx.dispose()
    throw new Error(
      `test-login for identity "${name}" failed (HTTP ${res.status()}). ` +
        `Check E2E_LOGIN_SECRET matches the value on the target API and that the ` +
        `deployed backend supports the ?identity= parameter (M10.2).`,
    )
  }
  const body = (await res.json()) as { status?: string; user_id?: string; email?: string }
  if (body.status !== 'signed_in' || !body.user_id || !body.email) {
    await ctx.dispose()
    throw new Error(`test-login for identity "${name}" returned an unexpected body`)
  }
  return { name, ctx, userId: body.user_id, email: body.email }
}
