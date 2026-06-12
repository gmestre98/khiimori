package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
	rec := get(t, newRouter(fakePinger{nil}), "/readyz")

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
	rec := get(t, newRouter(fakePinger{errors.New(secret)}), "/readyz")

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
	h := newRouter(fakePinger{errors.New("db down")})

	rec := get(t, h, "/healthz")
	if rec.Code != http.StatusOK {
		t.Errorf("/healthz status = %d, want 200 (liveness must not depend on the DB)", rec.Code)
	}
}
