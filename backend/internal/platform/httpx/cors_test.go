package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

const (
	allowedOrigin    = "https://khiimori-web.web.app"
	disallowedOrigin = "https://evil.example"
)

// okHandler is a trivial downstream that 200s, so a test can tell whether CORS
// passed the request through (handler ran) or short-circuited it (preflight).
func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	h := CORS([]string{allowedOrigin})(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", allowedOrigin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 (request should pass through)", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	// Credentialed CORS so the SPA can send the session cookie (M02.3).
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Access-Control-Allow-Credentials = %q, want true", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q, want Origin", got)
	}
}

func TestCORSRejectsDisallowedOrigin(t *testing.T) {
	h := CORS([]string{allowedOrigin})(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", disallowedOrigin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	// The request still reaches the handler, but with no CORS grant the browser
	// blocks the cross-origin read.
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want empty for a disallowed origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Errorf("Access-Control-Allow-Credentials = %q, want empty for a disallowed origin", got)
	}
}

func TestCORSPreflightAllowed(t *testing.T) {
	var handlerRan bool
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		handlerRan = true
		w.WriteHeader(http.StatusOK)
	})
	h := CORS([]string{allowedOrigin})(next)

	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", allowedOrigin)
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	req.Header.Set("Access-Control-Request-Headers", "X-Request-Id")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if handlerRan {
		t.Error("preflight should be answered by the middleware, not the handler")
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != corsAllowMethods {
		t.Errorf("Access-Control-Allow-Methods = %q, want %q", got, corsAllowMethods)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "X-Request-Id" {
		t.Errorf("Access-Control-Allow-Headers = %q, want X-Request-Id (echoed)", got)
	}
}

func TestCORSPreflightDisallowedGetsNoGrant(t *testing.T) {
	h := CORS([]string{allowedOrigin})(okHandler())

	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", disallowedOrigin)
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want empty (preflight rejected)", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "" {
		t.Errorf("Access-Control-Allow-Methods = %q, want empty (preflight rejected)", got)
	}
}

func TestCORSEmptyAllowlistIsNoOp(t *testing.T) {
	h := CORS(nil)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", allowedOrigin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want empty with no configured origins", got)
	}
}
