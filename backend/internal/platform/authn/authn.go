// Package authn carries the authenticated principal across the request boundary.
//
// It is the shared seam between the auth module, which validates the session and
// attaches the principal, and every other module's handlers, which read it. The
// principal lives in the platform layer (not the auth module) precisely so any
// domain module can read "who is this request" without importing another domain
// module — the modular-monolith boundary rule. This package holds no secrets and
// no validation logic; it is just the typed context plumbing.
package authn

import "context"

// ctxKey is the unexported context-key type, so the principal can only be set
// and read through this package's accessors.
type ctxKey int

const principalKey ctxKey = iota

// Principal is the authenticated user the auth middleware attaches to a request.
// v1 carries only the user id — enough to answer "who you are". Authorization
// (what you may touch) is layered on top by the Sharing module in Milestone 08,
// which consumes this principal; do not put authz state here.
type Principal struct {
	UserID string
}

// WithPrincipal returns a copy of ctx carrying p. The auth middleware sets it
// after validating the session; handlers read it back via FromContext.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// FromContext returns the authenticated principal on ctx. ok is false when no
// principal is present (an unauthenticated request, or a route not behind the
// auth middleware), so callers never mistake the zero Principal for a real user.
func FromContext(ctx context.Context) (p Principal, ok bool) {
	p, ok = ctx.Value(principalKey).(Principal)
	return p, ok
}
