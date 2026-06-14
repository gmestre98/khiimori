package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// authedModule builds a Module whose only configured concern is sessions, for
// exercising RequireAuth and the /auth/session route.
func authedModule() *Module {
	return &Module{sessions: testSessions()}
}

// sessionCookieFor mints a valid session cookie for userID using sm.
func sessionCookieFor(t *testing.T, sm *sessionManager, userID string) *http.Cookie {
	t.Helper()
	rec := httptest.NewRecorder()
	if err := sm.issue(rec, userID); err != nil {
		t.Fatalf("issue session: %v", err)
	}
	c := readSessionCookie(rec)
	if c == nil {
		t.Fatal("no session cookie issued")
	}
	return c
}

// TestRequireAuthValidSessionRunsHandlerWithPrincipal: a request carrying a valid
// session reaches the handler with the authenticated principal attached.
func TestRequireAuthValidSessionRunsHandlerWithPrincipal(t *testing.T) {
	t.Parallel()

	m := authedModule()

	var gotUserID string
	var ran bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ran = true
		if p, ok := authn.FromContext(r.Context()); ok {
			gotUserID = p.UserID
		}
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "user-42"))
	rec := httptest.NewRecorder()
	m.RequireAuth(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !ran {
		t.Fatal("protected handler did not run for a valid session")
	}
	if gotUserID != "user-42" {
		t.Errorf("attached UserID = %q, want user-42", gotUserID)
	}
}

// TestRequireAuthMissingCredentialIs401: with no session cookie the middleware
// returns 401 and never runs the protected handler.
func TestRequireAuthMissingCredentialIs401(t *testing.T) {
	t.Parallel()

	m := authedModule()
	ran := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { ran = true })

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rec := httptest.NewRecorder()
	m.RequireAuth(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if ran {
		t.Error("protected handler ran without a session")
	}
	if !strings.Contains(rec.Body.String(), "auth_required") {
		t.Errorf("body = %q, want the auth_required code", rec.Body.String())
	}
}

// TestRequireAuthExpiredCredentialIs401: an expired session is rejected with 401.
func TestRequireAuthExpiredCredentialIs401(t *testing.T) {
	t.Parallel()

	m := authedModule()
	// Mint a cookie that is already expired, then validate it with the live manager.
	expiredSM := newSessionManager([]byte("test-session-key"), false, -time.Hour)
	cookie := sessionCookieFor(t, expiredSM, "user-1")

	ran := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { ran = true })
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(cookie)
	rec := httptest.NewRecorder()
	m.RequireAuth(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if ran {
		t.Error("protected handler ran for an expired session")
	}
}

// TestRequireAuthTamperedCredentialIs401: a tampered cookie fails the HMAC and is
// rejected.
func TestRequireAuthTamperedCredentialIs401(t *testing.T) {
	t.Parallel()

	m := authedModule()
	cookie := sessionCookieFor(t, m.sessions, "user-1")
	cookie.Value += "x" // tamper

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(cookie)
	rec := httptest.NewRecorder()
	m.RequireAuth(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("handler ran for a tampered session")
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestSessionRouteReturnsUserID: GET /auth/session behind the middleware returns
// the authenticated user's id; without a session it is 401.
func TestSessionRouteReturnsUserID(t *testing.T) {
	t.Parallel()

	m := authedModule()

	// Authenticated: 200 with the user id.
	req := httptest.NewRequest(http.MethodGet, SessionPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "user-7"))
	rec := serve(m, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"user-7"`) {
		t.Errorf("body = %q, want it to carry user-7", rec.Body.String())
	}

	// Unauthenticated: 401.
	rec = serve(m, httptest.NewRequest(http.MethodGet, SessionPath, nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", rec.Code)
	}
}
