package httpx

import "context"

// ctxKey is the unexported type for httpx context keys, so values set here can
// only be read through this package's accessors.
type ctxKey int

const requestIDKey ctxKey = iota

// withRequestID returns a copy of ctx carrying the request id. The request-id
// middleware (S5) sets it; error rendering and access logging read it back.
func withRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestID returns the request id stored on ctx, or "" if none is present.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}
