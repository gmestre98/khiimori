package sharing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakePendingLister is a stub pendingInvitationLister for handler unit tests.
type fakePendingLister struct {
	invs []PendingInvitation
	err  error
}

func (f *fakePendingLister) PendingForEmail(_ context.Context, _ string) ([]PendingInvitation, error) {
	return f.invs, f.err
}

// TestHandleListMyInvitations_Unauthenticated returns 401 with no session.
func TestHandleListMyInvitations_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}, pendingList: &fakePendingLister{}}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleListMyInvitations_Success returns the pending invitations for the
// signed-in user's email as JSON.
func TestHandleListMyInvitations_Success(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails: &fakeUserEmailReader{email: "friend@example.com"},
		pendingList: &fakePendingLister{invs: []PendingInvitation{
			{ID: "inv-1", TripID: "trip-1", TripName: "Japan 2026", Role: RoleViewer},
		}},
	}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	var body struct {
		Invitations []myInvitationResponse `json:"invitations"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Invitations) != 1 {
		t.Fatalf("want 1 invitation, got %d", len(body.Invitations))
	}
	got := body.Invitations[0]
	if got.ID != "inv-1" || got.TripName != "Japan 2026" || got.Role != "viewer" {
		t.Errorf("unexpected invitation: %+v", got)
	}
}

// TestHandleListMyInvitations_EmailError returns 500 when the user email can't
// be resolved.
func TestHandleListMyInvitations_EmailError(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails:  &fakeUserEmailReader{err: errors.New("boom")},
		pendingList: &fakePendingLister{},
	}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", rr.Code)
	}
}

// fakeDecliner is a stub invitationDecliner for handler unit tests.
type fakeDecliner struct {
	err      error
	gotID    string
	gotEmail string
}

func (f *fakeDecliner) DeclineByID(_ context.Context, id, email string) error {
	f.gotID, f.gotEmail = id, email
	return f.err
}

// TestHandleDeclineMyInvitation_Unauthenticated returns 401 with no session.
func TestHandleDeclineMyInvitation_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}, invDecline: &fakeDecliner{}}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/decline", nil)
	req.SetPathValue("invitationID", "inv-1")
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleDeclineMyInvitation_MissingID returns 400 with no invitationID.
func TestHandleDeclineMyInvitation_MissingID(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}, invDecline: &fakeDecliner{}}

	req := httptest.NewRequest(http.MethodPost, "/invitations//decline", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleDeclineMyInvitation_Success declines with the caller's email and
// returns 204.
func TestHandleDeclineMyInvitation_Success(t *testing.T) {
	t.Parallel()
	dec := &fakeDecliner{}
	m := &Module{userEmails: &fakeUserEmailReader{email: "friend@example.com"}, invDecline: dec}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/decline", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	if dec.gotID != "inv-1" || dec.gotEmail != "friend@example.com" {
		t.Errorf("decline called with id=%q email=%q", dec.gotID, dec.gotEmail)
	}
}

// TestHandleDeclineMyInvitation_EmailMismatch maps ErrEmailMismatch to 403 so a
// caller cannot decline an invitation addressed to someone else.
func TestHandleDeclineMyInvitation_EmailMismatch(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails: &fakeUserEmailReader{email: "other@example.com"},
		invDecline: &fakeDecliner{err: ErrEmailMismatch},
	}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/decline", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

// TestHandleDeclineMyInvitation_AlreadyClaimed maps ErrInvitationAlreadyClaimed
// to 409.
func TestHandleDeclineMyInvitation_AlreadyClaimed(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails: &fakeUserEmailReader{email: "friend@example.com"},
		invDecline: &fakeDecliner{err: ErrInvitationAlreadyClaimed},
	}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/decline", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("want 409, got %d", rr.Code)
	}
}

// TestHandleDeclineMyInvitation_NotFound maps ErrInvitationNotFound to 404.
func TestHandleDeclineMyInvitation_NotFound(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails: &fakeUserEmailReader{email: "friend@example.com"},
		invDecline: &fakeDecliner{err: ErrInvitationNotFound},
	}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/decline", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleDeclineMyInvitation(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_Unauthenticated returns 401 with no session.
func TestHandleAcceptMyInvitation_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/accept", nil)
	req.SetPathValue("invitationID", "inv-1")
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_MissingID returns 400 when no invitationID is set.
func TestHandleAcceptMyInvitation_MissingID(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invitations//accept", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_EmailError returns 500 when the user email can't
// be resolved (before any DB work).
func TestHandleAcceptMyInvitation_EmailError(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{err: errors.New("boom")}}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/accept", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", rr.Code)
	}
}
