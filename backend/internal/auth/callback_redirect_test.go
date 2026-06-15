package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestCallbackRedirectsToWebAppOnSuccess: with a web app configured, a
// successful callback sets the session and redirects the browser back to the
// app (the browser-driven OAuth flow lands on a real page, not JSON).
func TestCallbackRedirectsToWebAppOnSuccess(t *testing.T) {
	t.Parallel()

	m, store := newProvisioningModule(newFakeUserRepo())
	m.webAppURL = "https://app.example"

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "https://app.example/" {
		t.Errorf("Location = %q, want the web app root", loc)
	}
	// The session must still be issued before the redirect.
	if readSessionCookie(rec) == nil {
		t.Error("no session cookie set on the redirecting response")
	}
}

// TestCallbackRedirectsToWebAppOnFailure: a failed sign-in (here a state
// mismatch) redirects back to the app with an ?auth_error= marker instead of a
// JSON error, so the user lands on the sign-in page.
func TestCallbackRedirectsToWebAppOnFailure(t *testing.T) {
	t.Parallel()

	m, store := newProvisioningModule(newFakeUserRepo())
	m.webAppURL = "https://app.example"

	_, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state=attacker-state&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	want := "https://app.example/?auth_error=auth_state_invalid"
	if loc := rec.Header().Get("Location"); loc != want {
		t.Errorf("Location = %q, want %q", loc, want)
	}
}

// TestCallbackFallsBackToJSONWithoutWebApp: with no web app configured, the
// callback keeps the JSON acknowledgement (a frontend-less backend / API
// callers are unaffected).
func TestCallbackFallsBackToJSONWithoutWebApp(t *testing.T) {
	t.Parallel()

	m, store := newProvisioningModule(newFakeUserRepo()) // webAppURL == ""

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (JSON fallback)", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "signed_in") {
		t.Errorf("body = %q, want the signed_in ack", rec.Body.String())
	}
}
