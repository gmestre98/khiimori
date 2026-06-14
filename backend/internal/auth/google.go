package auth

import (
	"context"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// GoogleConfig holds the OAuth 2.0 / OIDC parameters for the Google provider.
// Values come from config / Secret Manager; nothing is hardcoded (S5).
type GoogleConfig struct {
	ClientID     string
	ClientSecret string // from Secret Manager in production (S5)
	RedirectURI  string
}

// GoogleProvider implements IdentityProvider using Google OAuth 2.0 / OIDC.
// Construct it with NewGoogleProvider. AuthCodeURL is implemented in S2;
// Exchange (code swap + ID-token verification) is implemented in S3.
type GoogleProvider struct {
	cfg    GoogleConfig
	oauth2 oauth2.Config
	// provider (*oidc.Provider) and verifier (*oidc.IDTokenVerifier) are added
	// in S3 when Exchange is implemented; they require a network call to fetch
	// Google's OIDC discovery document.
}

// Compile-time assertion that *GoogleProvider satisfies IdentityProvider.
var _ IdentityProvider = (*GoogleProvider)(nil)

// NewGoogleProvider constructs a GoogleProvider from cfg. No network calls are
// made here; OIDC discovery (provider, verifier) is deferred to Exchange (S3).
func NewGoogleProvider(cfg GoogleConfig) *GoogleProvider {
	return &GoogleProvider{
		cfg: cfg,
		oauth2: oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURI,
			Endpoint:     google.Endpoint,
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
	}
}

// AuthCodeURL returns the Google consent URL carrying state and nonce (S2).
func (p *GoogleProvider) AuthCodeURL(state, nonce string) string {
	// Implemented in S2.
	return ""
}

// Exchange verifies state, exchanges the code, and validates the ID token (S3).
func (p *GoogleProvider) Exchange(_ context.Context, _ string) (VerifiedIdentity, error) {
	// Implemented in S3.
	return VerifiedIdentity{}, nil
}
