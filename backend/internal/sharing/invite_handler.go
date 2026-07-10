package sharing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// InvitationsPath is the trip-scoped invitations collection endpoint.
// POST creates and sends a new invitation (Owner only).
const InvitationsPath = "/trips/{tripID}/invitations"

// inviteRequest is the wire shape for creating an invitation.
type inviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// inviteResponse is the wire shape returned on a successful create.
type inviteResponse struct {
	ID     string `json:"id"`
	TripID string `json:"trip_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// invitationAuthorizer checks whether a user can perform an action on a trip.
// Satisfied by *MembershipAuthorizer.
type invitationAuthorizer interface {
	Can(ctx context.Context, userID, action, tripID string) (bool, error)
}

// tripNameReader fetches a trip's name by ID, used to populate the invite email.
type tripNameReader interface {
	NameByID(ctx context.Context, tripID string) (string, error)
}

// inviterNameReader fetches a user's display name by ID, used in the invite email.
type inviterNameReader interface {
	NameByID(ctx context.Context, userID string) (string, error)
}

// invitationCreator is the persistence seam for creating invitations. The real
// implementation is *Invitations; tests supply a fake.
type invitationCreator interface {
	Create(ctx context.Context, tripID, email, token string, role Role) (Invitation, error)
}

// handleCreateInvitation handles POST /trips/{tripID}/invitations.
// Only trip Owners may invite; the invite email is sent via EmailSender.
func (m *Module) handleCreateInvitation(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	tripID := r.PathValue("tripID")
	if tripID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID"))
		return
	}

	// Only Owners may invite.
	ok, err := m.authz.Can(r.Context(), principal.UserID, "manage", tripID)
	if err != nil {
		log.Error("invitation authz check", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "only trip owners may send invitations"))
		return
	}

	var req inviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "invalid request body"))
		return
	}

	// Normalize + validate the email before persisting: an invitation whose
	// email can't be matched by a verified sign-in is unacceptable forever, so a
	// typo or stray whitespace must be rejected here rather than silently stored.
	email, ok := normalizeEmail(req.Email)
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "a valid email address is required"))
		return
	}

	role := Role(req.Role)
	if role != RoleEditor && role != RoleViewer {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "role must be editor or viewer"))
		return
	}

	// Generate an unguessable token.
	token := uuid.New().String()

	inv, err := m.invCreate.Create(r.Context(), tripID, email, token, role)
	if err != nil {
		log.Error("create invitation", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not create invitation"))
		return
	}

	// Build the accept URL and resolve display names for the email.
	acceptURL := fmt.Sprintf("%s/invite/accept?token=%s", m.webAppURL, token)
	tripName, inviterName := m.resolveTripAndInviter(r.Context(), tripID, principal.UserID, log)

	if err := m.emailSender.SendInvite(r.Context(), InviteEmailParams{
		ToEmail:     email,
		TripName:    tripName,
		InviterName: inviterName,
		Role:        role,
		AcceptURL:   acceptURL,
	}); err != nil {
		// Non-fatal: the invitation row was created. Log and continue so the
		// invite can be resent or the owner can share the token manually.
		log.Error("send invite email", "err", err.Error())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(inviteResponse{
		ID:     inv.ID,
		TripID: inv.TripID,
		Email:  inv.Email,
		Role:   string(inv.Role),
		Status: string(inv.Status),
	})
}

// resolveTripAndInviter returns the trip name and inviter display name for the
// invitation email. Falls back to empty strings on any error (non-blocking).
func (m *Module) resolveTripAndInviter(ctx context.Context, tripID, userID string, log interface {
	Error(string, ...any)
}) (tripName, inviterName string) {
	if m.tripNames != nil {
		name, err := m.tripNames.NameByID(ctx, tripID)
		if err != nil {
			log.Error("resolve trip name for invite", "err", err.Error())
		} else {
			tripName = name
		}
	}
	if m.inviterNames != nil {
		name, err := m.inviterNames.NameByID(ctx, userID)
		if err != nil {
			log.Error("resolve inviter name for invite", "err", err.Error())
		} else {
			inviterName = name
		}
	}
	return tripName, inviterName
}
