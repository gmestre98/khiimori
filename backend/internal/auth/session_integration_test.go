package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestSessionLifecycleEndToEnd drives the full session lifecycle through the
// module's public HTTP surface — sign-in callback → protected route → sign-out →
// protected route again — exercising issuance, the auth middleware, and sign-out
// together rather than in isolation. It uses a test signing key (no Secret
// Manager) and the fake provider/repo, so no network or database is involved.
func TestSessionLifecycleEndToEnd(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	m, store := newProvisioningModule(repo) // wires provider, state store, provisioner, test sessions

	// 1. Issue: a successful callback provisions the user and sets the session.
	state, _, stateCookie := issueCookie(t, store)
	cbReq := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	cbReq.AddCookie(stateCookie)
	cbRec := serve(m, cbReq)
	if cbRec.Code != http.StatusOK {
		t.Fatalf("callback status = %d, want 200", cbRec.Code)
	}
	session := readSessionCookie(cbRec)
	if session == nil {
		t.Fatal("callback did not issue a session cookie")
	}
	wantUserID := repo.bySub["sub-1"].ID

	// 2. Protected route: the session authenticates and the handler sees the user.
	meReq := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	meReq.AddCookie(session)
	meRec := serve(m, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("authenticated /auth/session = %d, want 200", meRec.Code)
	}
	if !strings.Contains(meRec.Body.String(), wantUserID) {
		t.Errorf("body = %q, want it to carry the provisioned user id %q", meRec.Body.String(), wantUserID)
	}

	// The same credential keeps working across requests (no single-use semantics).
	reuse := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	reuse.AddCookie(session)
	if rec := serve(m, reuse); rec.Code != http.StatusOK {
		t.Fatalf("session reuse /auth/session = %d, want 200", rec.Code)
	}

	// 3. Sign out: clears the cookie.
	logoutRec := serve(m, httptest.NewRequest(http.MethodPost, LogoutPath, nil))
	if logoutRec.Code != http.StatusOK {
		t.Fatalf("logout = %d, want 200", logoutRec.Code)
	}
	cleared := readSessionCookie(logoutRec)
	if cleared == nil || (cleared.MaxAge >= 0 && cleared.Value != "") {
		t.Fatal("logout did not clear the session cookie")
	}

	// 4. After sign-out the browser drops the cookie, so the next call is 401.
	afterReq := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	if rec := serve(m, afterReq); rec.Code != http.StatusUnauthorized {
		t.Fatalf("post-logout /auth/session = %d, want 401", rec.Code)
	}
}
