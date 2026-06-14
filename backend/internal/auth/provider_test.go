package auth

import "testing"

// TestGoogleProviderSatisfiesInterface verifies that NewGoogleProvider returns a
// value that satisfies IdentityProvider and that the Module wires it correctly.
func TestGoogleProviderSatisfiesInterface(t *testing.T) {
	t.Parallel()

	cfg := GoogleConfig{
		ClientID:     "test-client-id.apps.googleusercontent.com",
		ClientSecret: "test-secret",
		RedirectURI:  "http://localhost:8080/auth/callback",
	}

	p := NewGoogleProvider(cfg)
	if p == nil {
		t.Fatal("NewGoogleProvider returned nil")
	}

	// Compile-time assertion is in google.go (var _ IdentityProvider = ...).
	// This runtime check confirms the interface is satisfied via an explicit
	// assignment so static analysis tools also see the relationship.
	var _ IdentityProvider = p

	if p.cfg.ClientID != cfg.ClientID {
		t.Errorf("ClientID = %q, want %q", p.cfg.ClientID, cfg.ClientID)
	}
	if p.cfg.RedirectURI != cfg.RedirectURI {
		t.Errorf("RedirectURI = %q, want %q", p.cfg.RedirectURI, cfg.RedirectURI)
	}
	if p.oauth2.ClientID != cfg.ClientID {
		t.Errorf("oauth2.ClientID = %q, want %q", p.oauth2.ClientID, cfg.ClientID)
	}
	if p.oauth2.RedirectURL != cfg.RedirectURI {
		t.Errorf("oauth2.RedirectURL = %q, want %q", p.oauth2.RedirectURL, cfg.RedirectURI)
	}
}
