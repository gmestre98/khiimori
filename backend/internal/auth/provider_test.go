package auth

import "testing"

// TestNewGoogleProviderSatisfiesInterface constructs the provider from a fake
// config and asserts it satisfies IdentityProvider (the S1 acceptance check).
// The provider's behaviour (AuthCodeURL, Exchange) is exercised through the
// interface in S2 and S3; here we only confirm construction and the contract.
func TestNewGoogleProviderSatisfiesInterface(t *testing.T) {
	t.Parallel()

	p := NewGoogleProvider(GoogleConfig{
		ClientID:     "test-client-id.apps.googleusercontent.com",
		ClientSecret: "test-secret",
		RedirectURI:  "http://localhost:8080/auth/callback",
	})
	if p == nil {
		t.Fatal("NewGoogleProvider returned nil")
	}

	// The constructed provider satisfies the interface callers depend on.
	var _ IdentityProvider = p
}
