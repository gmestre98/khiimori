package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestLogoutClearsSessionCookie: POST /auth/logout returns 200 and expires the
// session cookie so the browser stops sending it.
func TestLogoutClearsSessionCookie(t *testing.T) {
	t.Parallel()

	m := authedModule()

	req := httptest.NewRequest(http.MethodPost, LogoutPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "user-1"))
	rec := serve(m, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "signed_out") {
		t.Errorf("body = %q, want a signed_out ack", rec.Body.String())
	}
	c := readSessionCookie(rec)
	if c == nil {
		t.Fatal("logout did not set a session cookie to clear it")
	}
	if c.MaxAge >= 0 && c.Value != "" {
		t.Errorf("session cookie not cleared: MaxAge=%d Value=%q", c.MaxAge, c.Value)
	}
}

// TestLogoutIsIdempotent: signing out with no session cookie still succeeds and
// clears — sign-out is safe to call when already signed out.
func TestLogoutIsIdempotent(t *testing.T) {
	t.Parallel()

	m := authedModule()
	rec := serve(m, httptest.NewRequest(http.MethodPost, LogoutPath, nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 even with no session", rec.Code)
	}
	if c := readSessionCookie(rec); c == nil || (c.MaxAge >= 0 && c.Value != "") {
		t.Error("idempotent logout should still emit a cookie-clearing header")
	}
}

// TestLogoutThenSessionRejected: the round trip a browser makes — sign in, use
// the session, sign out (cookie cleared), then call again without the cookie —
// ends in a 401, so the signed-out user is no longer authenticated.
func TestLogoutThenSessionRejected(t *testing.T) {
	t.Parallel()

	m := authedModule()
	cookie := sessionCookieFor(t, m.sessions, "user-1")

	// Authenticated before sign-out.
	pre := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	pre.AddCookie(cookie)
	if rec := serve(m, pre); rec.Code != http.StatusOK {
		t.Fatalf("pre-logout /auth/session = %d, want 200", rec.Code)
	}

	// Sign out: the response clears the cookie.
	logoutRec := serve(m, httptest.NewRequest(http.MethodPost, LogoutPath, nil))
	cleared := readSessionCookie(logoutRec)
	if cleared == nil || (cleared.MaxAge >= 0 && cleared.Value != "") {
		t.Fatal("logout did not clear the session cookie")
	}

	// The browser, having dropped the cleared cookie, calls again without it → 401.
	post := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	if rec := serve(m, post); rec.Code != http.StatusUnauthorized {
		t.Fatalf("post-logout /auth/session = %d, want 401", rec.Code)
	}
}
