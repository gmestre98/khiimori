package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
)

// configuredModule builds an auth Module with valid OAuth settings (dev env).
func configuredModule() *Module {
	return New(config.Config{
		Env:               config.EnvDev,
		OAuthClientID:     "test-client-id.apps.googleusercontent.com",
		OAuthClientSecret: "test-secret",
		OAuthRedirectURI:  "http://localhost:8080/auth/callback",
	}, nil) // login tests don't provision, so no pool is needed
}

// serve mounts the module's routes and runs one request against them.
func serve(m *Module, req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	m.RegisterRoutes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// TestHandleLoginRedirectsToGoogle asserts /auth/login redirects to Google's
// consent screen and sets the signed state cookie.
func TestHandleLoginRedirectsToGoogle(t *testing.T) {
	t.Parallel()

	rec := serve(configuredModule(), httptest.NewRequest(http.MethodGet, LoginPath, nil))

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}

	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatalf("Location header is not a valid URL: %v", err)
	}
	if loc.Host != "accounts.google.com" {
		t.Errorf("redirect host = %q, want accounts.google.com", loc.Host)
	}
	if loc.Query().Get("state") == "" {
		t.Error("redirect URL is missing the state parameter")
	}
	if loc.Query().Get("nonce") == "" {
		t.Error("redirect URL is missing the nonce parameter")
	}

	if c := readStateCookie(t, rec); c.Value == "" {
		t.Error("login did not set a state cookie value")
	}
}

// TestHandleLoginStateCookieMatchesRedirect verifies the state sent to Google is
// exactly the one bound in the cookie (so the callback can compare them in S3).
func TestHandleLoginStateCookieMatchesRedirect(t *testing.T) {
	t.Parallel()

	rec := serve(configuredModule(), httptest.NewRequest(http.MethodGet, LoginPath, nil))

	loc, _ := url.Parse(rec.Header().Get("Location"))
	urlState := loc.Query().Get("state")

	// The cookie value is "<state>.<nonce>.<mac>"; its first field must be the
	// exact state echoed in the redirect, so the callback (S3) can compare them.
	c := readStateCookie(t, rec)
	if !strings.HasPrefix(c.Value, urlState+".") {
		t.Errorf("cookie value %q does not start with the redirect state %q", c.Value, urlState)
	}
}

// TestHandleLoginUnconfigured asserts an unconfigured provider returns a clear
// error rather than redirecting to a malformed consent URL.
func TestHandleLoginUnconfigured(t *testing.T) {
	t.Parallel()

	m := New(config.Config{Env: config.EnvDev}, nil) // no OAuth settings; unconfigured rejects before provisioning
	rec := serve(m, httptest.NewRequest(http.MethodGet, LoginPath, nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 for unconfigured sign-in", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "" {
		t.Errorf("unconfigured login must not redirect, got Location %q", loc)
	}
}

// TestHandleLoginRejectsNonGET confirms the method-scoped route returns 405 for
// non-GET requests (handled by the ServeMux method pattern).
func TestHandleLoginRejectsNonGET(t *testing.T) {
	t.Parallel()

	rec := serve(configuredModule(), httptest.NewRequest(http.MethodPost, LoginPath, nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST status = %d, want 405", rec.Code)
	}
}
