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

// AcceptInvitePath is the accept-invitation endpoint. The token is passed as a
// query parameter: POST /invite/accept?token=<token>
const AcceptInvitePath = "/invite/accept"

// userEmailReader fetches a user's verified email by user ID. The composition
// root supplies a DB-backed implementation so the sharing module never imports
// the auth module.
type userEmailReader interface {
	EmailByID(ctx context.Context, userID string) (string, error)
}

// handleAcceptInvitation handles POST /invite/accept?token=<token>.
// The caller must be authenticated (session cookie). Their verified Google
// email (from auth.users) is matched against the invitation email.
func (m *Module) handleAcceptInvitation(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "token is required"))
		return
	}

	// Resolve the signed-in user's verified email.
	userEmail, err := m.userEmails.EmailByID(r.Context(), principal.UserID)
	if err != nil {
		log.Error("accept invitation: resolve user email", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not resolve user email"))
		return
	}

	// Accept the invitation atomically: mark accepted + create membership in one tx.
	tx, err := m.pool.Begin(r.Context())
	if err != nil {
		log.Error("accept invitation: begin tx", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not begin transaction"))
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	inv, err := m.invitations.AcceptInTx(r.Context(), tx, token, principal.UserID, userEmail)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvitationNotFound):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "invitation not found"))
		case errors.Is(err, ErrInvitationAlreadyClaimed):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "invitation_already_claimed", "invitation has already been accepted or revoked"))
		case errors.Is(err, ErrEmailMismatch):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "email_mismatch", "invitation was not sent to your email address"))
		default:
			log.Error("accept invitation", "err", err.Error())
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not accept invitation"))
		}
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Error("accept invitation: commit", "err", err.Error())
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
