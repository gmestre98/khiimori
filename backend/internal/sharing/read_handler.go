package sharing

import (
	"encoding/json"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// MembershipsListPath is the trip-scoped memberships collection endpoint.
// GET returns all current members and their roles.
const MembershipsListPath = "/trips/{tripID}/memberships"

// InvitationsListPath is the trip-scoped invitations collection endpoint.
// GET returns all invitations for the trip.
const InvitationsListPath = "/trips/{tripID}/invitations"

// membershipResponse is the wire shape for a single membership in the list.
type membershipResponse struct {
	ID     string `json:"id"`
	TripID string `json:"trip_id"`
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

// invitationListResponse is the wire shape for a single invitation in the list.
type invitationListResponse struct {
	ID     string `json:"id"`
	TripID string `json:"trip_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// handleListMemberships handles GET /trips/{tripID}/memberships.
// Any member of the trip may list members; only Owners see manage controls
// (the client decides affordances; the server enforces actions).
func (m *Module) handleListMemberships(w http.ResponseWriter, r *http.Request) {
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

	// Any member may read the member list.
	ok, err := m.authz.Can(r.Context(), principal.UserID, "read", tripID)
	if err != nil {
		log.Error("list memberships authz", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "not a member of this trip"))
		return
	}

	members, err := m.memberships.MembershipsForTrip(r.Context(), tripID)
	if err != nil {
		log.Error("list memberships", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not list members"))
		return
	}

	out := make([]membershipResponse, 0, len(members))
	for _, mb := range members {
		out = append(out, membershipResponse{
			ID:     mb.ID,
			TripID: mb.TripID,
			UserID: mb.UserID,
			Role:   string(mb.Role),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"members": out})
}

// handleListInvitations handles GET /trips/{tripID}/invitations.
// Only Owners may list invitations.
func (m *Module) handleListInvitations(w http.ResponseWriter, r *http.Request) {
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

	// Only Owners may view invitations.
	ok, err := m.authz.Can(r.Context(), principal.UserID, "manage", tripID)
	if err != nil {
		log.Error("list invitations authz", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "authorization check failed"))
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusForbidden, "forbidden", "only trip owners may view invitations"))
		return
	}

	invitations, err := m.invitations.ForTrip(r.Context(), tripID)
	if err != nil {
		log.Error("list invitations", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not list invitations"))
		return
	}

	out := make([]invitationListResponse, 0, len(invitations))
	for _, inv := range invitations {
		out = append(out, invitationListResponse{
			ID:     inv.ID,
			TripID: inv.TripID,
			Email:  inv.Email,
			Role:   string(inv.Role),
			Status: string(inv.Status),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"invitations": out})
}
