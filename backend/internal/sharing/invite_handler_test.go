package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakeAuthz is a stub invitationAuthorizer for handler unit tests.
type fakeAuthz struct {
	allowed map[string]bool
}

func (f *fakeAuthz) Can(_ context.Context, userID, action, tripID string) (bool, error) {
	key := userID + ":" + action + ":" + tripID
	return f.allowed[key], nil
}

// fakeInvitationsCreator is a stub invitationCreator that records calls.
type fakeInvitationsCreator struct {
	created []Invitation
}

func (f *fakeInvitationsCreator) Create(_ context.Context, tripID, email, token string, role Role) (Invitation, error) {
	inv := Invitation{
		ID:     "inv-001",
		TripID: tripID,
		Email:  email,
		Role:   role,
		Status: StatusSent,
		Token:  token,
	}
	f.created = append(f.created, inv)
	return inv, nil
}

func newTestModule(authz invitationAuthorizer, email EmailSender, creator invitationCreator) *Module {
	return &Module{
		authz:       authz,
		emailSender: email,
		invCreate:   creator,
		webAppURL:   "https://app.example.com",
	}
}

// TestHandleCreateInvitation_Unauthenticated verifies that no principal → 401.
func TestHandleCreateInvitation_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := newTestModule(&fakeAuthz{}, &NoopEmailSender{}, &fakeInvitationsCreator{})

	req := httptest.NewRequest(http.MethodPost, "/trips/trip-1/invitations", bytes.NewBufferString(`{}`))
	req.SetPathValue("tripID", "trip-1")

	rr := httptest.NewRecorder()
	m.handleCreateInvitation(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleCreateInvitation_NotOwner verifies a non-owner gets 403.
func TestHandleCreateInvitation_NotOwner(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{}} // deny all
	m := newTestModule(authz, &NoopEmailSender{}, &fakeInvitationsCreator{})

	body := `{"email":"friend@example.com","role":"editor"}`
	req := httptest.NewRequest(http.MethodPost, "/trips/trip-1/invitations", bytes.NewBufferString(body))
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleCreateInvitation(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

// TestHandleCreateInvitation_InvalidRole verifies that a bad role → 400.
func TestHandleCreateInvitation_InvalidRole(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{"user-1:manage:trip-1": true}}
	m := newTestModule(authz, &NoopEmailSender{}, &fakeInvitationsCreator{})

	body := `{"email":"friend@example.com","role":"owner"}`
	req := httptest.NewRequest(http.MethodPost, "/trips/trip-1/invitations", bytes.NewBufferString(body))
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleCreateInvitation(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleCreateInvitation_OwnerSuccess verifies that an owner with valid
// input gets 201 and the noop sender records the send.
func TestHandleCreateInvitation_OwnerSuccess(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{"owner-1:manage:trip-1": true}}
	noop := &NoopEmailSender{}
	creator := &fakeInvitationsCreator{}
	m := newTestModule(authz, noop, creator)

	body, _ := json.Marshal(map[string]string{"email": "friend@example.com", "role": "editor"})
	req := httptest.NewRequest(http.MethodPost, "/trips/trip-1/invitations", bytes.NewReader(body))
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "owner-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleCreateInvitation(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("want 201, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	if len(creator.created) != 1 {
		t.Fatalf("want 1 invitation created, got %d", len(creator.created))
	}
	if creator.created[0].Email != "friend@example.com" {
		t.Errorf("want email friend@example.com, got %s", creator.created[0].Email)
	}
	if len(noop.Sent) != 1 {
		t.Fatalf("want 1 email sent, got %d", len(noop.Sent))
	}
	if noop.Sent[0].ToEmail != "friend@example.com" {
		t.Errorf("want ToEmail friend@example.com, got %s", noop.Sent[0].ToEmail)
	}
}
