package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// ReadinessPath is the route the readiness handler is mounted on.
const ReadinessPath = "GET /readyz"

// checkTimeout bounds how long the readiness probe waits for all checks, so a
// hung dependency can't hang the probe (and with it, the deploy gating on it).
const checkTimeout = 2 * time.Second

// ReadinessCheck reports whether one dependency is ready: nil means ready. The
// context carries the probe's deadline; checks must respect it.
type ReadinessCheck func(ctx context.Context) error

// Readiness aggregates named readiness checks and serves GET /readyz. Register
// checks once at startup (in cmd/api), before the server starts serving; the
// registry is not safe for concurrent mutation afterwards.
//
// Epic M01.3 plugs the database in by registering a ping check here — e.g.
// Register("database", func(ctx) error { return db.PingContext(ctx) }) — with
// no change to the handler or route contract.
type Readiness struct {
	names  []string // registration order, for stable response ordering
	checks map[string]ReadinessCheck
}

// NewReadiness builds an empty readiness registry. With no checks registered the
// probe reports ready.
func NewReadiness() *Readiness {
	return &Readiness{checks: make(map[string]ReadinessCheck)}
}

// Register adds a named readiness check. Registering the same name twice
// replaces the earlier check.
func (r *Readiness) Register(name string, check ReadinessCheck) {
	if _, exists := r.checks[name]; !exists {
		r.names = append(r.names, name)
	}
	r.checks[name] = check
}

// readyzBody is the wire shape of the readiness response:
//
//	{"status":"ready","checks":{"database":"ok"}}
type readyzBody struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}

// Handler serves the readiness probe: it runs every registered check under a
// bounded timeout and reports 200 with per-check statuses when all pass, or 503
// naming the failing checks when any fails. With no checks registered it
// reports ready.
func (r *Readiness) Handler(w http.ResponseWriter, req *http.Request) {
	ctx, cancel := context.WithTimeout(req.Context(), checkTimeout)
	defer cancel()

	body := readyzBody{Status: "ready"}
	status := http.StatusOK
	if len(r.names) > 0 {
		body.Checks = make(map[string]string, len(r.names))
	}

	for _, name := range r.names {
		if err := r.checks[name](ctx); err != nil {
			// Name the failing check but keep the error detail server-side;
			// probe responses may be visible to infrastructure.
			body.Checks[name] = "failed"
			body.Status = "unavailable"
			status = http.StatusServiceUnavailable
			continue
		}
		body.Checks[name] = "ok"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
