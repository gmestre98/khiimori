package health

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func doReadyz(t *testing.T, r *Readiness) (*httptest.ResponseRecorder, readyzBody) {
	t.Helper()
	rec := httptest.NewRecorder()
	r.Handler(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	var body readyzBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not valid JSON: %v\nbody: %s", err, rec.Body.Bytes())
	}
	return rec, body
}

func TestReadyzNoChecksIsReady(t *testing.T) {
	t.Parallel()

	rec, body := doReadyz(t, NewReadiness())

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if body.Status != "ready" {
		t.Errorf(`status = %q, want "ready"`, body.Status)
	}
}

func TestReadyzPassingCheck(t *testing.T) {
	t.Parallel()

	r := NewReadiness()
	r.Register("database", func(context.Context) error { return nil })

	rec, body := doReadyz(t, r)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if body.Checks["database"] != "ok" {
		t.Errorf(`checks["database"] = %q, want "ok"`, body.Checks["database"])
	}
}

func TestReadyzFailingCheck(t *testing.T) {
	t.Parallel()

	r := NewReadiness()
	r.Register("database", func(context.Context) error { return nil })
	r.Register("cache", func(context.Context) error {
		return errors.New("dial tcp 10.0.0.5:6379: connection refused")
	})

	rec, body := doReadyz(t, r)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
	if body.Status != "unavailable" {
		t.Errorf(`status = %q, want "unavailable"`, body.Status)
	}
	if body.Checks["cache"] != "failed" {
		t.Errorf(`checks["cache"] = %q, want "failed"`, body.Checks["cache"])
	}
	if body.Checks["database"] != "ok" {
		t.Errorf(`checks["database"] = %q, want "ok" (passing checks still reported)`, body.Checks["database"])
	}
	// Error detail stays server-side; the response only names the check.
	if got := rec.Body.String(); strings.Contains(got, "connection refused") || strings.Contains(got, "10.0.0.5") {
		t.Errorf("internal error detail leaked into probe response: %s", got)
	}
}

func TestReadyzHungCheckIsBounded(t *testing.T) {
	t.Parallel()

	r := NewReadiness()
	r.Register("hung", func(ctx context.Context) error {
		// A well-behaved check respects the probe's deadline; simulate a hung
		// dependency that only returns when the context expires.
		<-ctx.Done()
		return ctx.Err()
	})

	start := time.Now()
	rec, _ := doReadyz(t, r)
	elapsed := time.Since(start)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
	// The probe must come back near the bounded timeout, not hang indefinitely.
	if elapsed > checkTimeout+time.Second {
		t.Errorf("probe took %v, want ~%v (bounded by timeout)", elapsed, checkTimeout)
	}
}
