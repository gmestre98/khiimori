package sharing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// MyInvitationsPath is the user-scoped pending-invitations endpoint. GET returns
// the invitations addressed to the signed-in user's verified email that they
// have not accepted yet. It is the in-app path to join a shared trip without
// ever needing the invitation email — the invite email is best-effort, so this
// is the reliable way a recipient discovers they've been invited.
const MyInvitationsPath = "/invitations"

// MyInvitationAcceptPath accepts one of the caller's own pending invitations by
// id (as returned by MyInvitationsPath). The signed-in user's verified email
// must match the invitation's email — the id alone does not grant access.
const MyInvitationAcceptPath = "/invitations/{invitationID}/accept"

// pendingInvitationLister is the read seam for the in-app inbox; defaults to
// *Invitations. Tests supply a fake without a real pool.
type pendingInvitationLister interface {
	PendingForEmail(ctx context.Context, email string) ([]PendingInvitation, error)
}

// myInvitationResponse is the wire shape for one pending invitation in the inbox.
type myInvitationResponse struct {
	ID       string `json:"id"`
	TripID   string `json:"trip_id"`
	TripName string `json:"trip_name"`
	Role     string `json:"role"`
}

// handleListMyInvitations handles GET /invitations: the pending invitations
// waiting for the signed-in user, matched on their verified email.
func (m *Module) handleListMyInvitations(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	userEmail, err := m.userEmails.EmailByID(r.Context(), principal.UserID)
	if err != nil {
		log.Error("list my invitations: resolve user email", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not resolve user email"))
		return
	}

	invs, err := m.pendingList.PendingForEmail(r.Context(), userEmail)
	if err != nil {
		log.Error("list my invitations", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not list invitations"))
		return
	}

	out := make([]myInvitationResponse, 0, len(invs))
	for _, i := range invs {
		out = append(out, myInvitationResponse{
			ID:       i.ID,
			TripID:   i.TripID,
			TripName: i.TripName,
			Role:     string(i.Role),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"invitations": out})
}

// handleAcceptMyInvitation handles POST /invitations/{invitationID}/accept.
// The caller accepts an invitation surfaced by handleListMyInvitations; their
// verified email must match the invitation's, so this grants access only to the
// intended recipient even though the request carries no opaque token.
func (m *Module) handleAcceptMyInvitation(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	invitationID := r.PathValue("invitationID")
	if invitationID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing invitationID"))
		return
	}

	userEmail, err := m.userEmails.EmailByID(r.Context(), principal.UserID)
	if err != nil {
		log.Error("accept my invitation: resolve user email", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not resolve user email"))
		return
	}

	tx, err := m.pool.Begin(r.Context())
	if err != nil {
		log.Error("accept my invitation: begin tx", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not begin transaction"))
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	inv, err := m.invitations.AcceptByIDInTx(r.Context(), tx, invitationID, principal.UserID, userEmail)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvitationNotFound):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "invitation not found"))
		case errors.Is(err, ErrInvitationAlreadyClaimed):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "invitation_already_claimed", "invitation has already been accepted or revoked"))
		case errors.Is(err, ErrEmailMismatch):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "email_mismatch", "invitation was not sent to your email address"))
		default:
			log.Error("accept my invitation", "err", err.Error())
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not accept invitation"))
		}
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Error("accept my invitation: commit", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not complete invitation accept"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"trip_id": inv.TripID,
		"role":    string(inv.Role),
		"status":  string(inv.Status),
	})
}
