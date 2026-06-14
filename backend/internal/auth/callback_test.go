package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
)

// fakeProvider is an IdentityProvider stub recording how Exchange was called.
type fakeProvider struct {
	identity VerifiedIdentity
	err      error
	called   bool
	gotCode  string
	gotNonce string
}

func (f *fakeProvider) AuthCodeURL(state, nonce string) string {
	return "https://accounts.google.com/o/oauth2/auth?state=" + state + "&nonce=" + nonce
}

func (f *fakeProvider) Exchange(_ context.Context, code, nonce string) (VerifiedIdentity, error) {
	f.called = true
	f.gotCode, f.gotNonce = code, nonce
	return f.identity, f.err
}

// signInCapture records what the sign-in seam received.
type signInCapture struct {
	called bool
	id     VerifiedIdentity
}

// newCallbackModule builds a configured Module with the given provider, a shared
// state store (so issue/verify line up), and a capturing onVerified.
func newCallbackModule(p IdentityProvider) (*Module, *oauthStateStore, *signInCapture) {
	store := newOAuthStateStore([]byte("test-key"), false)
	cap := &signInCapture{}
	m := &Module{
		provider:   p,
		stateStore: store,
		configured: true,
		onVerified: func(w http.ResponseWriter, _ *http.Request, id VerifiedIdentity) {
			cap.called = true
			cap.id = id
			w.WriteHeader(http.StatusOK)
		},
	}
	return m, store, cap
}

// issueCookie issues a state cookie from store and returns the bound state and
// nonce plus the cookie, so a test can build a callback request with whatever
// query state it wants (matching or not).
func issueCookie(t *testing.T, store *oauthStateStore) (state, nonce string, cookie *http.Cookie) {
	t.Helper()
	rec := httptest.NewRecorder()
	state, nonce, err := store.issue(rec)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	return state, nonce, readStateCookie(t, rec)
}

// assertStateCookieCleared fails unless the response expires the state cookie.
func assertStateCookieCleared(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	c := readStateCookie(t, rec)
	if c.MaxAge >= 0 && c.Value != "" {
		t.Errorf("state cookie not cleared: MaxAge=%d Value=%q", c.MaxAge, c.Value)
	}
}

// TestHandleCallbackSuccess: a valid state + successful exchange yields the
// verified identity at the sign-in seam, passes the bound nonce to Exchange,
// and clears the state cookie.
func TestHandleCallbackSuccess(t *testing.T) {
	t.Parallel()

	want := VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann", Avatar: "https://pic"}
	fp := &fakeProvider{identity: want}
	m, store, cap := newCallbackModule(fp)

	state, nonce, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !cap.called {
		t.Fatal("sign-in seam was not invoked")
	}
	if cap.id != want {
		t.Errorf("identity = %+v, want %+v", cap.id, want)
	}
	if fp.gotCode != "auth-code" {
		t.Errorf("Exchange code = %q, want auth-code", fp.gotCode)
	}
	if fp.gotNonce != nonce {
		t.Errorf("Exchange nonce = %q, want the bound nonce %q", fp.gotNonce, nonce)
	}
	assertStateCookieCleared(t, rec)
}

// TestHandleCallbackStateMismatch: a state that doesn't match the cookie is
// rejected before any exchange and yields no sign-in (CSRF guard).
func TestHandleCallbackStateMismatch(t *testing.T) {
	t.Parallel()

	fp := &fakeProvider{identity: VerifiedIdentity{GoogleSub: "x"}}
	m, store, cap := newCallbackModule(fp)

	// Attach a valid cookie but send a different state in the query.
	_, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state=attacker-state&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if fp.called {
		t.Error("Exchange must not run on a state mismatch")
	}
	if cap.called {
		t.Error("sign-in seam must not run on a state mismatch")
	}
	assertStateCookieCleared(t, rec)
}

// TestHandleCallbackMissingCookie: no state cookie → rejected, no exchange.
func TestHandleCallbackMissingCookie(t *testing.T) {
	t.Parallel()

	fp := &fakeProvider{}
	m, _, cap := newCallbackModule(fp)

	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state=s&code=c", nil)
	rec := serve(m, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if fp.called || cap.called {
		t.Error("a callback without a state cookie must not exchange or sign in")
	}
}

// TestHandleCallbackExchangeFailure: a verification failure in Exchange rejects
// the sign-in without invoking the seam (no user/session created).
func TestHandleCallbackExchangeFailure(t *testing.T) {
	t.Parallel()

	fp := &fakeProvider{err: errors.New("id-token verification failed")}
	m, store, cap := newCallbackModule(fp)

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if !fp.called {
		t.Error("Exchange should have been attempted for a valid state")
	}
	if cap.called {
		t.Error("sign-in seam must not run when Exchange fails")
	}
}

// TestHandleCallbackConsentDenied: Google's error parameter is rejected.
func TestHandleCallbackConsentDenied(t *testing.T) {
	t.Parallel()

	fp := &fakeProvider{}
	m, _, cap := newCallbackModule(fp)

	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?error=access_denied", nil)
	rec := serve(m, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if fp.called || cap.called {
		t.Error("a denied consent must not exchange or sign in")
	}
}

// TestHandleCallbackMissingParams: absent code or state is a 400.
func TestHandleCallbackMissingParams(t *testing.T) {
	t.Parallel()

	fp := &fakeProvider{}
	m, _, _ := newCallbackModule(fp)

	for _, q := range []string{"?state=s", "?code=c", ""} {
		rec := serve(m, httptest.NewRequest(http.MethodGet, CallbackPath+q, nil))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("query %q: status = %d, want 400", q, rec.Code)
		}
	}
}

// TestHandleCallbackUnconfigured: an unconfigured provider returns 503.
func TestHandleCallbackUnconfigured(t *testing.T) {
	t.Parallel()

	m := New(config.Config{Env: config.EnvDev}) // no OAuth settings
	rec := serve(m, httptest.NewRequest(http.MethodGet, CallbackPath+"?state=s&code=c", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
