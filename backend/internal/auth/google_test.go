package auth

import (
	"net/url"
	"strings"
	"testing"
)

// testGoogleConfig is a valid-looking config for URL-construction tests.
func testGoogleConfig() GoogleConfig {
	return GoogleConfig{
		ClientID:     "test-client-id.apps.googleusercontent.com",
		ClientSecret: "test-secret",
		RedirectURI:  "http://localhost:8080/auth/callback",
	}
}

// TestAuthCodeURL asserts the consent URL carries the configured client ID, the
// exact redirect URI, the OIDC scopes, and the per-request state and nonce.
func TestAuthCodeURL(t *testing.T) {
	t.Parallel()

	cfg := testGoogleConfig()
	p := NewGoogleProvider(cfg)

	raw := p.AuthCodeURL("state-abc", "nonce-xyz")
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("AuthCodeURL returned an unparseable URL %q: %v", raw, err)
	}

	if got := u.Scheme + "://" + u.Host + u.Path; got != "https://accounts.google.com/o/oauth2/auth" {
		t.Errorf("consent endpoint = %q, want Google's authorization endpoint", got)
	}

	q := u.Query()
	checks := map[string]string{
		"client_id":     cfg.ClientID,
		"redirect_uri":  cfg.RedirectURI,
		"response_type": "code",
		"state":         "state-abc",
		"nonce":         "nonce-xyz",
	}
	for param, want := range checks {
		if got := q.Get(param); got != want {
			t.Errorf("query %q = %q, want %q", param, got, want)
		}
	}

	// Scopes must include OIDC + the email/profile we need to build an identity.
	scope := q.Get("scope")
	for _, want := range []string{"openid", "email", "profile"} {
		if !strings.Contains(scope, want) {
			t.Errorf("scope %q is missing %q", scope, want)
		}
	}
}

// TestAuthCodeURLExactRedirectURI guards against scheme/trailing-slash drift in
// the redirect URI — a top cause of OAuth misconfiguration: the value in the URL
// must be byte-identical to the configured one.
func TestAuthCodeURLExactRedirectURI(t *testing.T) {
	t.Parallel()

	cfg := testGoogleConfig()
	cfg.RedirectURI = "https://khiimori.example.com/auth/callback"
	p := NewGoogleProvider(cfg)

	u, err := url.Parse(p.AuthCodeURL("s", "n"))
	if err != nil {
		t.Fatalf("unparseable URL: %v", err)
	}
	if got := u.Query().Get("redirect_uri"); got != cfg.RedirectURI {
		t.Errorf("redirect_uri = %q, want exact %q", got, cfg.RedirectURI)
	}
}
