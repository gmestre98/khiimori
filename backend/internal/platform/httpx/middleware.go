package httpx

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"time"

	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// requestIDHeader is the header carrying the per-request id, both inbound (so a
// caller / load balancer can supply one) and outbound (echoed on the response).
const requestIDHeader = "X-Request-Id"

// Middleware wraps an http.Handler with cross-cutting behaviour.
type Middleware func(http.Handler) http.Handler

// Chain applies middlewares around h so the first listed runs outermost. The
// composition root applies the chain once at the root so every module inherits
// it: Chain(router, RequestIDMiddleware(), Logging(logger), Recovery()).
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// RequestIDMiddleware generates (or honours an inbound) request id per request,
// stores it on the request context (read back via RequestID), and echoes it on
// the response header.
func RequestIDMiddleware() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get(requestIDHeader)
			if id == "" {
				id = newRequestID()
			}
			w.Header().Set(requestIDHeader, id)
			next.ServeHTTP(w, r.WithContext(withRequestID(r.Context(), id)))
		})
	}
}

// newRequestID returns a random hex request id, falling back to a timestamp if
// the system entropy source is somehow unavailable.
func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

// Logging attaches a request-scoped logger (carrying the request id) to the
// context so downstream handlers log through it, and emits a structured access
// log line per request.
//
// Per the project-wide errors-only policy (S2) a line is emitted at error level
// only for failed requests (5xx); the success path logs at info, which stays
// suppressed under the default error level until the level is raised later.
func Logging(base *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

			reqLogger := base.With("request_id", RequestID(r.Context()))
			ctx := platformlog.WithContext(r.Context(), reqLogger)

			next.ServeHTTP(rec, r.WithContext(ctx))

			logAccess(reqLogger, r, rec.status, time.Since(start))
		})
	}
}

// logAccess emits one access-log line. Failed requests log at error (visible
// under the default level); successes log at info (suppressed by default).
func logAccess(logger *slog.Logger, r *http.Request, status int, dur time.Duration) {
	attrs := []any{
		"method", r.Method,
		"path", r.URL.Path,
		"status", status,
		"duration_ms", dur.Milliseconds(),
	}
	if status >= http.StatusInternalServerError {
		logger.Error("request failed", attrs...)
		return
	}
	logger.Info("request", attrs...)
}

// Recovery recovers panics from downstream handlers, logs them with stack and
// request context through the request-scoped logger, and returns a clean JSON
// 500 via WriteError so one bad handler can't take the server down.
func Recovery() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					platformlog.FromContext(r.Context()).Error("panic recovered",
						"panic", fmt.Sprint(v),
						"stack", string(debug.Stack()),
					)
					WriteError(w, r, errors.New("recovered panic"))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// statusRecorder wraps an http.ResponseWriter to capture the status code written
// by a handler for the access log; it defaults to 200 when the handler writes a
// body without an explicit WriteHeader.
type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (r *statusRecorder) WriteHeader(code int) {
	if !r.wrote {
		r.status = code
		r.wrote = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.status = http.StatusOK
		r.wrote = true
	}
	return r.ResponseWriter.Write(b)
}
