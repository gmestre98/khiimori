package auth

import (
	"context"
	"errors"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// errNotImplemented is returned by provider methods whose behaviour lands in a
// later story, so a half-wired flow fails loudly instead of looking like a
// successful (but empty) result.
var errNotImplemented = errors.New("auth: google provider method not implemented yet")

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
//
// Endpoint source (deliberate): the authorization-code leg (AuthCodeURL,
// token exchange) uses Google's static endpoint (oauth2/google.Endpoint), so
// no network round-trip is needed to start a sign-in — important for a
// scale-to-zero deployment. OIDC discovery (oidc.NewProvider) is used in S3
// only to obtain the JWKS-backed ID-token verifier. The two are kept separate
// on purpose; S3 must NOT switch the oauth2 leg to the discovered endpoint,
// which would introduce a second source of truth for the same URLs.
type GoogleProvider struct {
	cfg      GoogleConfig
	oauthCfg oauth2.Config
	// The OIDC verifier (*oidc.IDTokenVerifier), built from the discovery
	// document, is added in S3 when Exchange is implemented; it requires a
	// network call so it is not constructed here.
}

// Compile-time assertion that *GoogleProvider satisfies IdentityProvider.
var _ IdentityProvider = (*GoogleProvider)(nil)

// NewGoogleProvider constructs a GoogleProvider from cfg. No network calls are
// made here; OIDC discovery (the verifier) is deferred to Exchange (S3).
func NewGoogleProvider(cfg GoogleConfig) *GoogleProvider {
	return &GoogleProvider{
		cfg: cfg,
		oauthCfg: oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURI,
			Endpoint:     google.Endpoint,
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
	}
}

// AuthCodeURL returns the Google consent URL for the authorization-code flow,
// carrying the CSRF state and the OIDC nonce. The URL embeds the configured
// client ID, the exact redirect URI, and the openid/email/profile scopes; the
// nonce is added as the standard OIDC `nonce` parameter (verified against the
// ID token's claim in S3).
func (p *GoogleProvider) AuthCodeURL(state, nonce string) string {
	return p.oauthCfg.AuthCodeURL(state, oidc.Nonce(nonce))
}

// Exchange verifies state, exchanges the code, and validates the ID token (S3).
func (p *GoogleProvider) Exchange(_ context.Context, _ string) (VerifiedIdentity, error) {
	// Implemented in S3. Returns an error (not a nil-error empty identity) so a
	// callback wired before S3 cannot mistake the stub for a successful sign-in.
	return VerifiedIdentity{}, errNotImplemented
}
