package authn

import (
	"context"
	"testing"
)

// TestWithPrincipalRoundTrips: a principal stored on the context is read back
// unchanged.
func TestWithPrincipalRoundTrips(t *testing.T) {
	t.Parallel()

	ctx := WithPrincipal(context.Background(), Principal{UserID: "user-1"})
	got, ok := FromContext(ctx)
	if !ok {
		t.Fatal("FromContext reported no principal after WithPrincipal")
	}
	if got.UserID != "user-1" {
		t.Errorf("UserID = %q, want user-1", got.UserID)
	}
}

// TestFromContextEmpty: a context with no principal reports ok=false and the
// zero value, so a missing principal is never mistaken for a real user.
func TestFromContextEmpty(t *testing.T) {
	t.Parallel()

	got, ok := FromContext(context.Background())
	if ok {
		t.Error("FromContext reported a principal on a bare context")
	}
	if got.UserID != "" {
		t.Errorf("UserID = %q, want empty", got.UserID)
	}
}
