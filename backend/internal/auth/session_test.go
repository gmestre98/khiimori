package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// testSessions builds a session manager with a fixed test key (dev-mode cookie
// attributes), so tests don't depend on Secret Manager.
func testSessions() *sessionManager {
	return newSessionManager([]byte("test-session-key"), false, sessionTTL)
}

// readSessionCookie returns the session cookie from a recorder, or nil.
func readSessionCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookieName {
			return c
		}
	}
	return nil
}

// TestSessionIssueEncodesUserAndRoundTrips: issuing a session writes an httpOnly
// cookie whose value verifies back to the same user id.
func TestSessionIssueEncodesUserAndRoundTrips(t *testing.T) {
	t.Parallel()

	sm := testSessions()
	rec := httptest.NewRecorder()
	if err := sm.issue(rec, "user-123"); err != nil {
		t.Fatalf("issue: %v", err)
	}

	c := readSessionCookie(rec)
	if c == nil {
		t.Fatal("no session cookie was set")
	}
	if !c.HttpOnly {
		t.Error("session cookie is not HttpOnly")
	}
	if c.Path != sessionCookiePath {
		t.Errorf("cookie Path = %q, want %q", c.Path, sessionCookiePath)
	}
	if c.MaxAge <= 0 {
		t.Errorf("cookie MaxAge = %d, want a positive lifetime", c.MaxAge)
	}

	// The credential must verify back to the encoded identity.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	uid, issuedAt, err := sm.verify(req)
	if err != nil {
		t.Fatalf("verify of a freshly issued session: %v", err)
	}
	if uid != "user-123" {
		t.Errorf("verified user id = %q, want user-123", uid)
	}
	if time.Since(issuedAt) > time.Minute {
		t.Errorf("issuedAt = %v, want ~now", issuedAt)
	}
}

// TestSessionProductionCookieAttributes: in production the cookie is Secure and
// SameSite=None so the cross-site SPA can send it.
func TestSessionProductionCookieAttributes(t *testing.T) {
	t.Parallel()

	sm := newSessionManager([]byte("k"), true, sessionTTL)
	rec := httptest.NewRecorder()
	if err := sm.issue(rec, "u"); err != nil {
		t.Fatalf("issue: %v", err)
	}
	c := readSessionCookie(rec)
	if c == nil {
		t.Fatal("no session cookie")
	}
	if !c.Secure {
		t.Error("production session cookie must be Secure")
	}
	if c.SameSite != http.SameSiteNoneMode {
		t.Errorf("production SameSite = %v, want None (cross-site SPA→API)", c.SameSite)
	}
}

// TestSessionVerifyMissingCookie: no cookie yields errNoSession, distinct from a
// tampering error.
func TestSessionVerifyMissingCookie(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if _, _, err := testSessions().verify(req); err != errNoSession {
		t.Errorf("verify without a cookie: err = %v, want errNoSession", err)
	}
}

// TestSessionVerifyRejectsTamperedValue: flipping any byte of the cookie breaks
// the HMAC and fails verification.
func TestSessionVerifyRejectsTamperedValue(t *testing.T) {
	t.Parallel()

	sm := testSessions()
	rec := httptest.NewRecorder()
	if err := sm.issue(rec, "user-1"); err != nil {
		t.Fatalf("issue: %v", err)
	}
	c := readSessionCookie(rec)
	c.Value += "x" // tamper

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	if _, _, err := sm.verify(req); err == nil {
		t.Error("verify accepted a tampered session cookie")
	}
}

// TestSessionVerifyRejectsForeignKey: a session signed with a different key does
// not verify — so rotating the key invalidates existing sessions.
func TestSessionVerifyRejectsForeignKey(t *testing.T) {
	t.Parallel()

	issuer := newSessionManager([]byte("old-key"), false, sessionTTL)
	rec := httptest.NewRecorder()
	if err := issuer.issue(rec, "user-1"); err != nil {
		t.Fatalf("issue: %v", err)
	}
	c := readSessionCookie(rec)

	verifier := newSessionManager([]byte("new-key"), false, sessionTTL)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	if _, _, err := verifier.verify(req); err == nil {
		t.Error("a session signed with a rotated-away key still verified")
	}
}

// TestSessionVerifyRejectsExpired: a session whose expiry has passed is rejected.
func TestSessionVerifyRejectsExpired(t *testing.T) {
	t.Parallel()

	sm := newSessionManager([]byte("k"), false, -time.Hour) // already expired
	rec := httptest.NewRecorder()
	if err := sm.issue(rec, "user-1"); err != nil {
		t.Fatalf("issue: %v", err)
	}
	c := readSessionCookie(rec)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	if _, _, err := sm.verify(req); err == nil {
		t.Error("verify accepted an expired session")
	}
}

// TestRefreshIfStaleSlidesAgingSession: a session past its half-life is
// re-issued (a fresh cookie is written); a young one is left alone.
func TestRefreshIfStaleSlidesAgingSession(t *testing.T) {
	t.Parallel()

	sm := newSessionManager([]byte("k"), false, time.Hour)

	// Young session (issued now): no refresh.
	youngRec := httptest.NewRecorder()
	sm.refreshIfStale(youngRec, "user-1", time.Now())
	if readSessionCookie(youngRec) != nil {
		t.Error("a fresh session should not be slid")
	}

	// Aging session (issued 40m ago, past the 30m half-life): refreshed.
	oldRec := httptest.NewRecorder()
	sm.refreshIfStale(oldRec, "user-1", time.Now().Add(-40*time.Minute))
	c := readSessionCookie(oldRec)
	if c == nil {
		t.Fatal("an aging session should be slid (a new cookie issued)")
	}
	// The slid cookie must still authenticate as the same user.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	uid, _, err := sm.verify(req)
	if err != nil || uid != "user-1" {
		t.Errorf("slid session: uid=%q err=%v, want user-1 / nil", uid, err)
	}
}

// TestSessionIssueUnconfigured: with no signing key, issue errors rather than
// minting an unsigned credential.
func TestSessionIssueUnconfigured(t *testing.T) {
	t.Parallel()

	sm := newSessionManager(nil, false, sessionTTL)
	if err := sm.issue(httptest.NewRecorder(), "u"); err == nil {
		t.Error("issue with no signing key should error")
	}
}

// TestCompleteSignInIssuesSessionCookie: a successful callback provisions the
// user and sets the session cookie on the response.
func TestCompleteSignInIssuesSessionCookie(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	m, store := newProvisioningModule(repo)
	m.sessions = testSessions()

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	c := readSessionCookie(rec)
	if c == nil {
		t.Fatal("callback did not set a session cookie")
	}
	// The cookie must authenticate as the provisioned user.
	verifyReq := httptest.NewRequest(http.MethodGet, "/", nil)
	verifyReq.AddCookie(c)
	uid, _, err := m.sessions.verify(verifyReq)
	if err != nil {
		t.Fatalf("issued session does not verify: %v", err)
	}
	stored := repo.bySub["sub-1"]
	if uid != stored.ID {
		t.Errorf("session user id = %q, want the provisioned user's id %q", uid, stored.ID)
	}
}

// TestCompleteSignInSessionUnconfigured: if the session key is missing, the
// callback fails with 500 rather than signing the user in without a session.
func TestCompleteSignInSessionUnconfigured(t *testing.T) {
	t.Parallel()

	m, store := newProvisioningModule(newFakeUserRepo())
	m.sessions = newSessionManager(nil, false, sessionTTL) // unconfigured

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if readSessionCookie(rec) != nil {
		t.Error("a session cookie was set despite the missing signing key")
	}
	if strings.Contains(rec.Body.String(), "signed_in") {
		t.Error("returned signed_in without issuing a session")
	}
}
