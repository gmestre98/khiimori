// Package health provides the service's health probes: liveness (/healthz,
// this file) and readiness (/readyz, S8). Liveness answers "is the process
// up?" and must stay trivial and dependency-free — it never touches the
// database or any external service, so an uptime check or Cloud Run never
// restarts a healthy instance because a downstream is slow. Readiness is the
// separate endpoint that may check dependencies.
package health

import (
	"encoding/json"
	"net/http"
)

// LivenessPath is the route the liveness handler is mounted on.
const LivenessPath = "GET /healthz"

// Healthz answers the liveness probe: a constant 200 with a small JSON body and
// no I/O of any kind.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
