// Package auth owns authentication and identity: Google SSO, sessions and
// tokens, and the user profile.
//
// The Google OAuth 2.0 / OIDC sign-in flow (setup, configuration, end-to-end
// flow, and security notes) is documented in backend/docs/oauth-signin.md, and
// the session mechanism (stateless signed cookie, auth middleware, sign-out,
// expiry/refresh, CSRF stance) in backend/docs/sessions.md.
package auth
