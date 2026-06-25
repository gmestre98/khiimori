package sharing

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// MembershipPath is the item path for a single trip membership.
// PATCH changes role; DELETE revokes the membership.
const MembershipPath = "/trips/{tripID}/memberships/{userID}"

// InvitationItemPath is the item path for a single invitation.
// DELETE revokes a pending invitation.
const InvitationItemPath = "/trips/{tripID}/invitations/{invitationID}"

// changeRoleRequest is the wire shape for PATCH /trips/{tripID}/memberships/{userID}.
type changeRoleRequest struct {
	Role string `json:"role"`
}

// handleChangeRole handles PATCH /trips/{tripID}/memberships/{userID}.
// Only Owners may change a member's role (Editor↔Viewer).
func (m *Module) handleChangeRole(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	tripID := r.PathValue("tripID")
	targetUserID := r.PathValue("userID")
	if tripID == "" || targetUserID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID or userID"))
		return
	}

	// Only Owners may manage roles.
	ok, err := m.authz.Can(r.Context(), principal.UserID, "manage", tripID)
	if err != nil {
		log.Error("change role authz", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "only trip owners may change roles"))
		return
	}

	var req changeRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "invalid request body"))
		return
	}

	role := Role(req.Role)
	if role != RoleEditor && role != RoleViewer {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "role must be editor or viewer"))
		return
	}

	if err := m.memberships.ChangeRole(r.Context(), tripID, targetUserID, role); err != nil {
		if errors.Is(err, ErrMembershipNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "membership not found"))
			return
		}
		log.Error("change role", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not change role"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleRevokeMembership handles DELETE /trips/{tripID}/memberships/{userID}.
// Only Owners may revoke memberships.
func (m *Module) handleRevokeMembership(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	tripID := r.PathValue("tripID")
	targetUserID := r.PathValue("userID")
	if tripID == "" || targetUserID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID or userID"))
		return
	}

	ok, err := m.authz.Can(r.Context(), principal.UserID, "manage", tripID)
	if err != nil {
		log.Error("revoke membership authz", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "only trip owners may revoke memberships"))
		return
	}

	if err := m.memberships.Revoke(r.Context(), tripID, targetUserID); err != nil {
		if errors.Is(err, ErrMembershipNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "membership not found"))
			return
		}
		log.Error("revoke membership", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not revoke membership"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleRevokeInvitation handles DELETE /trips/{tripID}/invitations/{invitationID}.
// Only Owners may revoke pending invitations.
func (m *Module) handleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "not authenticated"))
		return
	}

	tripID := r.PathValue("tripID")
	invitationID := r.PathValue("invitationID")
	if tripID == "" || invitationID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID or invitationID"))
		return
	}

	ok, err := m.authz.Can(r.Context(), principal.UserID, "manage", tripID)
	if err != nil {
		log.Error("revoke invitation authz", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "only trip owners may revoke invitations"))
		return
	}

	if err := m.invitations.RevokeInvitation(r.Context(), invitationID); err != nil {
		switch {
		case errors.Is(err, ErrInvitationNotFound):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "invitation not found"))
		case errors.Is(err, ErrInvitationAlreadyClaimed):
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "invitation_already_accepted", "invitation has already been accepted"))
		default:
			log.Error("revoke invitation", "err", err.Error())
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not revoke invitation"))
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
