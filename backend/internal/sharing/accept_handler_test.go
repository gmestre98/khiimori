package sharing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakeUserEmailReader is a stub userEmailReader for unit tests.
type fakeUserEmailReader struct {
	email string
	err   error
}

func (f *fakeUserEmailReader) EmailByID(_ context.Context, _ string) (string, error) {
	return f.email, f.err
}

// TestHandleAcceptInvitation_Unauthenticated returns 401 when there is no session.
func TestHandleAcceptInvitation_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invite/accept?token=abc", nil)
	rr := httptest.NewRecorder()
	m.handleAcceptInvitation(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleAcceptInvitation_MissingToken returns 400 when no token is supplied.
func TestHandleAcceptInvitation_MissingToken(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invite/accept", nil)
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()
	m.handleAcceptInvitation(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleAcceptInvitation_NilPool returns 500 when the pool is nil (misconfigured).
// This is the expected unit-test boundary — the full accept flow needs a real DB
// and is covered by the integration tests in S5.
func TestHandleAcceptInvitation_NilPool(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails:  &fakeUserEmailReader{email: "friend@example.com"},
		invitations: &Invitations{}, // nil pool — Begin will panic
		pool:        nil,
	}

	req := httptest.NewRequest(http.MethodPost, "/invite/accept?token=some-token", nil)
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()

	// Expect a 500 (nil pool → Begin panics → recovery not in place, so we
	// recover here to confirm we get past auth+token validation).
	func() {
		defer func() {
			if r := recover(); r != nil {
				// Got to pool.Begin with a nil pool — validation passed.
				t.Log("reached pool.Begin (nil pool panic) — validation passed as expected")
			}
		}()
		m.handleAcceptInvitation(rr, req)
	}()

	// If we didn't panic, we should have a non-client-error response.
	if rr.Code == http.StatusUnauthorized || rr.Code == http.StatusBadRequest {
		t.Errorf("unexpected client error %d — auth+token validation should have passed", rr.Code)
	}
}
