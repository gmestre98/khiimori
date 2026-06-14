package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// googleIssuer is the OIDC issuer for Google accounts. The ID-token verifier
// checks the token's `iss` claim against it, and OIDC discovery is fetched from
// its well-known endpoint.
const googleIssuer = "https://accounts.google.com"

// GoogleConfig holds the OAuth 2.0 / OIDC parameters for the Google provider.
// Values come from config / Secret Manager; nothing is hardcoded (S5).
type GoogleConfig struct {
	ClientID     string
	ClientSecret string // from Secret Manager in production (S5)
	RedirectURI  string
}

// GoogleProvider implements IdentityProvider using Google OAuth 2.0 / OIDC.
// Construct it with NewGoogleProvider.
//
// Endpoint source (deliberate): the authorization-code leg (AuthCodeURL, token
// exchange) uses Google's static endpoint (oauth2/google.Endpoint), so no
// network round-trip is needed to start a sign-in — important for a
// scale-to-zero deployment. OIDC discovery (oidc.NewProvider) is used only to
// build the JWKS-backed ID-token verifier, lazily on first Exchange. The two
// are kept separate on purpose.
type GoogleProvider struct {
	cfg      GoogleConfig
	oauthCfg oauth2.Config

	// issuer is the OIDC issuer used for discovery and `iss` validation.
	// Overridable so tests can point at a local OIDC server (default: Google).
	issuer string
	// httpClient, when non-nil, is injected into the context for OIDC discovery,
	// JWKS fetches, and the token exchange — so tests run fully offline. Nil in
	// production (the default client is used).
	httpClient *http.Client

	// verifier is built once on first Exchange (OIDC discovery is a network
	// call, so it is deferred out of construction/startup). mu guards it.
	mu       sync.Mutex
	verifier *oidc.IDTokenVerifier
}

// Compile-time assertion that *GoogleProvider satisfies IdentityProvider.
var _ IdentityProvider = (*GoogleProvider)(nil)

// NewGoogleProvider constructs a GoogleProvider from cfg. No network calls are
// made here; OIDC discovery (the verifier) is deferred to the first Exchange.
func NewGoogleProvider(cfg GoogleConfig) *GoogleProvider {
	return &GoogleProvider{
		cfg:    cfg,
		issuer: googleIssuer,
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
// ID token's claim in Exchange).
func (p *GoogleProvider) AuthCodeURL(state, nonce string) string {
	return p.oauthCfg.AuthCodeURL(state, oidc.Nonce(nonce))
}

// Exchange swaps the authorization code for tokens, then verifies the returned
// ID token's signature (via Google's JWKS), audience, issuer, and expiry, and
// that its nonce claim matches expectedNonce. Only on full success does it
// return a trusted VerifiedIdentity. Tokens and codes are never logged (S5).
func (p *GoogleProvider) Exchange(ctx context.Context, code, expectedNonce string) (VerifiedIdentity, error) {
	ctx = p.clientContext(ctx)

	token, err := p.oauthCfg.Exchange(ctx, code)
	if err != nil {
		return VerifiedIdentity{}, fmt.Errorf("auth: code exchange failed: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return VerifiedIdentity{}, errors.New("auth: token response carried no id_token")
	}

	verifier, err := p.idTokenVerifier(ctx)
	if err != nil {
		return VerifiedIdentity{}, fmt.Errorf("auth: building id-token verifier: %w", err)
	}

	// Verify checks the signature against the issuer's JWKS and validates the
	// audience (client ID), issuer, and expiry.
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return VerifiedIdentity{}, fmt.Errorf("auth: id-token verification failed: %w", err)
	}

	// Bind the token to this sign-in attempt: its nonce must match the one
	// minted at /auth/login. Reject an empty expected nonce outright so a token
	// without a nonce can never slip through, and compare in constant time.
	if expectedNonce == "" ||
		subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(expectedNonce)) != 1 {
		return VerifiedIdentity{}, errors.New("auth: id-token nonce mismatch")
	}

	var claims struct {
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return VerifiedIdentity{}, fmt.Errorf("auth: parsing id-token claims: %w", err)
	}

	return VerifiedIdentity{
		GoogleSub: idToken.Subject,
		Email:     claims.Email,
		Name:      claims.Name,
		Avatar:    claims.Picture,
	}, nil
}

// idTokenVerifier returns the cached verifier, building it on first use via OIDC
// discovery. The build is a network call, so it happens on the first sign-in
// rather than at startup. A failed build is not cached, so the next attempt
// retries.
func (p *GoogleProvider) idTokenVerifier(ctx context.Context) (*oidc.IDTokenVerifier, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.verifier != nil {
		return p.verifier, nil
	}
	provider, err := oidc.NewProvider(ctx, p.issuer)
	if err != nil {
		return nil, err
	}
	p.verifier = provider.Verifier(&oidc.Config{ClientID: p.cfg.ClientID})
	return p.verifier, nil
}

// clientContext injects the test HTTP client (when set) so OIDC discovery, JWKS
// fetches, and the token exchange all use it. go-oidc's ClientContext sets the
// same context key oauth2 reads, so one call covers both. A nil client leaves
// the context unchanged (production uses the default client).
func (p *GoogleProvider) clientContext(ctx context.Context) context.Context {
	if p.httpClient == nil {
		return ctx
	}
	return oidc.ClientContext(ctx, p.httpClient)
}
