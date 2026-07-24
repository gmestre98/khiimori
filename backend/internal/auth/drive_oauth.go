package auth

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// driveHTTPTimeout bounds the Drive token exchange so a hung Google endpoint
// cannot pin a request goroutine on this scale-to-zero service.
const driveHTTPTimeout = 15 * time.Second

// driveFileScope is the least-privilege Drive scope: it grants access only to
// files and folders this app creates or the user explicitly opens (e.g. via the
// Google Picker), never the user's whole Drive. It deliberately avoids the broad
// `drive` scope, which is a Google "restricted" scope subject to an annual
// third-party security assessment for published apps (M13 milestone decision 3).
const driveFileScope = "https://www.googleapis.com/auth/drive.file"

// driveStateTTL bounds how long a Drive-connect authorization may stay in flight
// between the consent redirect and the callback.
const driveStateTTL = 10 * time.Minute

// DriveToken is the subset of an OAuth token the Drive integration keeps after a
// successful connect: the long-lived RefreshToken (persisted encrypted by S2),
// the current AccessToken and its Expiry, and the scopes Google actually granted
// (the user can deselect scopes on the consent screen, so this is verified).
type DriveToken struct {
	AccessToken  string
	RefreshToken string
	Expiry       time.Time
	Scopes       []string
}

// driveAuthProvider is the seam over the Drive OAuth flow, mirroring
// IdentityProvider for sign-in. It has two operations: build the consent URL
// (with offline access so Google returns a refresh token) and exchange the
// callback code for a DriveToken. Kept as an interface so handlers can be tested
// without talking to Google.
type driveAuthProvider interface {
	// AuthCodeURL returns the Google consent URL for a Drive-connect attempt,
	// carrying the signed state (which binds the initiating user, see
	// driveStateSigner).
	AuthCodeURL(state string) string
	// Exchange swaps the authorization code for a DriveToken. It does not verify
	// scopes — the caller checks the granted scopes against what it needs.
	Exchange(ctx context.Context, code string) (*DriveToken, error)
}

// DriveOAuthProvider implements driveAuthProvider using Google OAuth 2.0. It
// reuses the same OAuth client id/secret as sign-in but a separate redirect URI
// and the drive.file scope. Construct it with NewDriveOAuthProvider.
type DriveOAuthProvider struct {
	cfg oauth2.Config
	// httpClient is injected into the exchange context. In production it is a
	// client with a bounded timeout (driveHTTPTimeout); tests replace it with a
	// client pointed at a stub token endpoint. Never nil after construction.
	httpClient *http.Client
}

// Compile-time assertion.
var _ driveAuthProvider = (*DriveOAuthProvider)(nil)

// NewDriveOAuthProvider builds a provider from the shared OAuth client
// credentials and the Drive-specific redirect URI. No network calls are made
// here.
func NewDriveOAuthProvider(clientID, clientSecret, redirectURI string) *DriveOAuthProvider {
	return &DriveOAuthProvider{
		cfg: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Endpoint:     google.Endpoint,
			Scopes:       []string{driveFileScope},
		},
		httpClient: &http.Client{Timeout: driveHTTPTimeout},
	}
}

// oauthConfig returns a copy of the underlying OAuth config, so the connection
// store can build a refresh TokenSource from a stored refresh token using the
// same client credentials and endpoint.
func (p *DriveOAuthProvider) oauthConfig() oauth2.Config { return p.cfg }

// AuthCodeURL returns the consent URL with access_type=offline and
// prompt=consent, which together guarantee Google returns a refresh token — even
// on a re-consent by a user who has connected before (without prompt=consent a
// repeat authorization omits the refresh token).
func (p *DriveOAuthProvider) AuthCodeURL(state string) string {
	return p.cfg.AuthCodeURL(state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
	)
}

// Exchange swaps the code for a token and extracts the DriveToken, including the
// scopes Google granted (the space-separated "scope" field of the token
// response). Tokens and codes are never logged (S5).
func (p *DriveOAuthProvider) Exchange(ctx context.Context, code string) (*DriveToken, error) {
	if p.httpClient != nil {
		ctx = context.WithValue(ctx, oauth2.HTTPClient, p.httpClient)
	}
	tok, err := p.cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("auth: drive code exchange failed: %w", err)
	}
	dt := &DriveToken{
		AccessToken:  tok.AccessToken,
		RefreshToken: tok.RefreshToken,
		Expiry:       tok.Expiry,
		Scopes:       parseScopeField(tok.Extra("scope")),
	}
	return dt, nil
}

// parseScopeField turns the token response's "scope" extra (a space-separated
// string per RFC 6749) into a slice. A missing/oddly-typed field yields nil.
func parseScopeField(v any) []string {
	s, ok := v.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.Fields(s)
}

// hasScope reports whether granted contains want.
func hasScope(granted []string, want string) bool {
	for _, g := range granted {
		if g == want {
			return true
		}
	}
	return false
}

// driveStateSigner mints and verifies the OAuth `state` for the Drive-connect
// flow. Unlike sign-in (which parks a signed cookie in the __session slot), the
// Drive flow runs while the user is already signed in, so it must not touch the
// session cookie — and Firebase Hosting strips every request cookie except
// __session, so a second state cookie could not survive the round-trip anyway.
//
// Instead the state is fully stateless: an HMAC-signed token that binds the
// initiating user's id and an expiry. The callback (behind RequireAuth) verifies
// the signature and expiry and cross-checks the bound user against the session
// principal. Because an attacker cannot forge a state bound to a victim's id
// (they lack the key), and the callback rejects a state whose user != the
// session user, this closes the connect-CSRF window without a cookie.
type driveStateSigner struct {
	key []byte
}

// newDriveStateSigner derives the signing key from the OAuth client secret via a
// domain-separated HMAC, so no separate secret is provisioned (same approach as
// deriveStateKey for sign-in, with a distinct domain string).
func newDriveStateSigner(clientSecret string) *driveStateSigner {
	return &driveStateSigner{key: deriveHMACKey(clientSecret, "khiimori:drive-oauth-state:v1")}
}

// sign returns "<b64(userID)>.<nonce>.<exp>.<mac>" binding userID with a fresh
// nonce and an absolute expiry (Unix seconds). The nonce keeps two states minted
// for the same user distinct/unguessable.
func (s *driveStateSigner) sign(userID string) (string, error) {
	nonce, err := randomToken()
	if err != nil {
		return "", err
	}
	exp := time.Now().Add(driveStateTTL).Unix()
	payload := base64.RawURLEncoding.EncodeToString([]byte(userID)) +
		"." + nonce +
		"." + strconv.FormatInt(exp, 10)
	return payload + "." + s.mac(payload), nil
}

// verify checks the state's signature and expiry and returns the bound user id.
// All failures (malformed, bad signature, expired, bad encoding) return an error
// and no user id.
func (s *driveStateSigner) verify(state string) (userID string, err error) {
	parts := strings.Split(state, ".")
	if len(parts) != 4 {
		return "", errors.New("auth: drive state malformed")
	}
	payload := parts[0] + "." + parts[1] + "." + parts[2]
	if subtle.ConstantTimeCompare([]byte(parts[3]), []byte(s.mac(payload))) != 1 {
		return "", errors.New("auth: drive state signature invalid")
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return "", errors.New("auth: drive state expiry malformed")
	}
	if time.Now().Unix() > exp {
		return "", errors.New("auth: drive state expired")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || len(raw) == 0 {
		return "", errors.New("auth: drive state user malformed")
	}
	return string(raw), nil
}

// mac returns the URL-safe base64 HMAC-SHA256 of payload under the signer key.
func (s *driveStateSigner) mac(payload string) string {
	return macB64(s.key, payload)
}
