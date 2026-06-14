package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

// These tests exercise GoogleProvider.Exchange — the trust boundary of the auth
// system — against a fully offline OIDC server (discovery + JWKS + token
// endpoint). ID tokens are minted and RS256-signed with a test key using only
// the standard library, so no live calls to Google and no new dependency. The
// network boundary is the test server injected via the provider's issuer +
// httpClient seam (S3).

const (
	testKID      = "test-key-1"
	testClientID = "test-client.apps.googleusercontent.com"
)

// oidcTestServer is an httptest OIDC provider whose /token endpoint returns a
// caller-supplied id_token, so each test controls exactly what is verified.
type oidcTestServer struct {
	srv     *httptest.Server
	signKey *rsa.PrivateKey // the key the JWKS publishes
	idToken string          // id_token the /token endpoint returns this test
}

// newOIDCTestServer starts an offline OIDC provider and registers cleanup.
func newOIDCTestServer(t *testing.T) *oidcTestServer {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate test key: %v", err)
	}
	h := &oidcTestServer{signKey: key}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{
			"issuer": %q,
			"authorization_endpoint": %q,
			"token_endpoint": %q,
			"jwks_uri": %q
		}`, h.srv.URL, h.srv.URL+"/auth", h.srv.URL+"/token", h.srv.URL+"/jwks")
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(jwksJSON(testKID, &key.PublicKey)))
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"access_token":"test-access","token_type":"Bearer","expires_in":3600,"id_token":%q}`, h.idToken)
	})

	h.srv = httptest.NewServer(mux)
	t.Cleanup(h.srv.Close)
	return h
}

// provider builds a GoogleProvider whose discovery, JWKS, and token calls all go
// to the test server (via the issuer + httpClient seam).
func (h *oidcTestServer) provider() *GoogleProvider {
	return &GoogleProvider{
		cfg:        GoogleConfig{ClientID: testClientID, ClientSecret: "test-secret", RedirectURI: "http://localhost/cb"},
		issuer:     h.srv.URL,
		httpClient: h.srv.Client(),
		oauthCfg: oauth2.Config{
			ClientID:     testClientID,
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/cb",
			Endpoint:     oauth2.Endpoint{AuthURL: h.srv.URL + "/auth", TokenURL: h.srv.URL + "/token"},
		},
	}
}

// standardClaims returns a valid claim set for the test issuer/audience.
func (h *oidcTestServer) standardClaims(nonce string) map[string]any {
	now := time.Now()
	return map[string]any{
		"iss":            h.srv.URL,
		"aud":            testClientID,
		"sub":            "google-sub-123",
		"email":          "user@example.com",
		"email_verified": true,
		"name":           "Test User",
		"picture":        "https://pic.example/u",
		"nonce":          nonce,
		"iat":            now.Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
}

// signIDToken mints an RS256 JWT for claims, signed with key under kid.
func signIDToken(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	seg := func(v any) string {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal jwt segment: %v", err)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	header := map[string]any{"alg": "RS256", "typ": "JWT", "kid": kid}
	signingInput := seg(header) + "." + seg(claims)

	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// jwksJSON renders a single-key RSA JWKS for pub under kid.
func jwksJSON(kid string, pub *rsa.PublicKey) string {
	n := base64.RawURLEncoding.EncodeToString(pub.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes())
	return fmt.Sprintf(`{"keys":[{"kty":"RSA","alg":"RS256","use":"sig","kid":%q,"n":%q,"e":%q}]}`, kid, n, e)
}

// TestExchangeValidToken: a correctly-signed, current token for this audience
// and issuer yields the expected VerifiedIdentity claims.
func TestExchangeValidToken(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	h.idToken = signIDToken(t, h.signKey, testKID, h.standardClaims("the-nonce"))

	got, err := h.provider().Exchange(context.Background(), "auth-code", "the-nonce")
	if err != nil {
		t.Fatalf("Exchange of a valid token failed: %v", err)
	}
	want := VerifiedIdentity{
		GoogleSub:     "google-sub-123",
		Email:         "user@example.com",
		EmailVerified: true,
		Name:          "Test User",
		Avatar:        "https://pic.example/u",
	}
	if got != want {
		t.Errorf("identity = %+v, want %+v", got, want)
	}
}

// TestExchangeExpiredToken: an expired token is rejected.
func TestExchangeExpiredToken(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	claims := h.standardClaims("the-nonce")
	claims["exp"] = time.Now().Add(-time.Hour).Unix()
	claims["iat"] = time.Now().Add(-2 * time.Hour).Unix()
	h.idToken = signIDToken(t, h.signKey, testKID, claims)

	if _, err := h.provider().Exchange(context.Background(), "auth-code", "the-nonce"); err == nil {
		t.Error("Exchange accepted an expired token")
	}
}

// TestExchangeWrongAudience: a token minted for a different client is rejected.
func TestExchangeWrongAudience(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	claims := h.standardClaims("the-nonce")
	claims["aud"] = "someone-else.apps.googleusercontent.com"
	h.idToken = signIDToken(t, h.signKey, testKID, claims)

	if _, err := h.provider().Exchange(context.Background(), "auth-code", "the-nonce"); err == nil {
		t.Error("Exchange accepted a token with the wrong audience")
	}
}

// TestExchangeWrongIssuer: a token whose iss != the discovery issuer is rejected.
func TestExchangeWrongIssuer(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	claims := h.standardClaims("the-nonce")
	claims["iss"] = "https://evil.example.com"
	h.idToken = signIDToken(t, h.signKey, testKID, claims)

	if _, err := h.provider().Exchange(context.Background(), "auth-code", "the-nonce"); err == nil {
		t.Error("Exchange accepted a token with the wrong issuer")
	}
}

// TestExchangeBadSignature: a token signed with a key not in the JWKS is
// rejected (signature verification fails).
func TestExchangeBadSignature(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	wrongKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate wrong key: %v", err)
	}
	// Same kid so the verifier selects the published key, but the signature was
	// produced by a different private key.
	h.idToken = signIDToken(t, wrongKey, testKID, h.standardClaims("the-nonce"))

	if _, err := h.provider().Exchange(context.Background(), "auth-code", "the-nonce"); err == nil {
		t.Error("Exchange accepted a token with a bad signature")
	}
}

// TestExchangeNonceMismatch: a validly-signed token whose nonce differs from the
// one minted at /auth/login is rejected (replay guard).
func TestExchangeNonceMismatch(t *testing.T) {
	t.Parallel()

	h := newOIDCTestServer(t)
	h.idToken = signIDToken(t, h.signKey, testKID, h.standardClaims("token-nonce"))

	if _, err := h.provider().Exchange(context.Background(), "auth-code", "expected-nonce"); err == nil {
		t.Error("Exchange accepted a token whose nonce did not match the expected nonce")
	}
}
