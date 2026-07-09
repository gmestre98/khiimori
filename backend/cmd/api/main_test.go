package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/journal"
	"github.com/gmestre98/khiimori/backend/internal/platform/config"
)

// fakePinger is a db.Pinger whose Ping result is fixed, so the readiness wiring
// can be tested without a live database.
type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

type readyzBody struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func TestReadyzReportsDBHealthy(t *testing.T) {
	rec := get(t, newRouter(fakePinger{nil}, nil, config.Config{}, journal.NoopMediaStore{}), "/readyz")

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	var body readyzBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.Checks["db"] != "ok" {
		t.Errorf(`checks["db"] = %q, want "ok"`, body.Checks["db"])
	}
}

func TestReadyzReportsDBUnreachable(t *testing.T) {
	secret := "connection refused to 10.0.0.5:5432 with password hunter2"
	rec := get(t, newRouter(fakePinger{errors.New(secret)}, nil, config.Config{}, journal.NoopMediaStore{}), "/readyz")

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
	var body readyzBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.Checks["db"] != "failed" {
		t.Errorf(`checks["db"] = %q, want "failed"`, body.Checks["db"])
	}
	// The probe names the failing check but must not leak the error detail.
	if strings.Contains(rec.Body.String(), "hunter2") || strings.Contains(rec.Body.String(), "10.0.0.5") {
		t.Errorf("internal error detail leaked into probe response: %s", rec.Body.String())
	}
}

// TestHealthzIgnoresDB asserts liveness does no DB I/O: it is 200 even when the
// database is unreachable (only readiness should flip).
func TestHealthzIgnoresDB(t *testing.T) {
	h := newRouter(fakePinger{errors.New("db down")}, nil, config.Config{}, journal.NoopMediaStore{})

	rec := get(t, h, "/healthz")
	if rec.Code != http.StatusOK {
		t.Errorf("/healthz status = %d, want 200 (liveness must not depend on the DB)", rec.Code)
	}
}

// The web app reaches the API same-origin through Firebase Hosting's `/api/**`
// rewrite, so every route must answer under an `/api` prefix as well as at the
// root. Health probes and the deployed E2E/smoke checks still hit the root paths
// directly, so both must work. /readyz stands in for "any route".
func TestAPIPrefixAliasesRootRoutes(t *testing.T) {
	h := newRouter(fakePinger{nil}, nil, config.Config{}, journal.NoopMediaStore{})

	for _, path := range []string{"/readyz", "/api/readyz"} {
		if rec := get(t, h, path); rec.Code != http.StatusOK {
			t.Errorf("GET %s status = %d, want 200 (root and /api prefix must both route)", path, rec.Code)
		}
	}
}

func TestDebugTriggerErrorWhenEnabled(t *testing.T) {
	h := newRouter(fakePinger{nil}, nil, config.Config{DebugErrorTrigger: true}, journal.NoopMediaStore{})

	rec := get(t, h, "/debug/trigger-error")

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	// Response must carry the stable code; must NOT leak internal detail.
	if !strings.Contains(rec.Body.String(), "debug_error_trigger") {
		t.Errorf("response missing code: %s", rec.Body.String())
	}
}

func TestDebugTriggerErrorWhenDisabled(t *testing.T) {
	h := newRouter(fakePinger{nil}, nil, config.Config{}, journal.NoopMediaStore{})

	// When the trigger is disabled the path must return 404 so it is not
	// discoverable in normal operation.
	rec := get(t, h, "/debug/trigger-error")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (debug route must be invisible when disabled)", rec.Code)
	}
}

func TestPlanItemCategory(t *testing.T) {
	cases := []struct {
		in   string
		want budget.Category
	}{
		// Canonical category names sent by the new dropdown (case-insensitive).
		{"Transport", budget.CategoryTransport},
		{"transport", budget.CategoryTransport},
		{"Stays", budget.CategoryStays},
		{"Food", budget.CategoryFood},
		{"Activities", budget.CategoryActivities},
		{"Other", budget.CategoryOther},
		// Legacy free-text values still map so historical items categorise right.
		{"flight", budget.CategoryTransport},
		{"  Hotel ", budget.CategoryStays},
		{"museum", budget.CategoryActivities},
		{"restaurant", budget.CategoryFood},
		// Anything unrecognised (and empty) falls through to Other.
		{"", budget.CategoryOther},
		{"whatever", budget.CategoryOther},
	}
	for _, c := range cases {
		if got := planItemCategory(c.in); got != c.want {
			t.Errorf("planItemCategory(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
