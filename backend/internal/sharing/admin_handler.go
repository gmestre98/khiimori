package sharing

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// AdminTripMembersPath is the admin endpoint to grant access to a trip.
const AdminTripMembersPath = "/admin/trips/{tripID}/members"

// AdminTripMemberPath is the admin endpoint for a specific member in a trip.
// PATCH changes role; DELETE revokes access.
const AdminTripMemberPath = "/admin/trips/{tripID}/members/{userID}"

// adminGrantRequest is the wire shape for POST /admin/trips/{tripID}/members.
type adminGrantRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

// handleAdminGrantAccess grants a user access to a trip without requiring trip
// ownership — the admin gating (RequireAdmin) is the sole authorization check.
func (m *Module) handleAdminGrantAccess(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())
	tripID := r.PathValue("tripID")
	if tripID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID"))
		return
	}

	var req adminGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "invalid request body"))
		return
	}
	if req.UserID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "user_id is required"))
		return
	}
	role := Role(req.Role)
	if role != RoleEditor && role != RoleViewer && role != RoleOwner {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "role must be owner, editor or viewer"))
		return
	}

	if err := m.memberships.Add(r.Context(), tripID, req.UserID, role); err != nil {
		if errors.Is(err, ErrMembershipAlreadyExists) {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "already_exists", "membership already exists"))
			return
		}
		log.Error("admin grant access", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not grant access"))
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// handleAdminChangeRole changes a member's role within a trip. It reuses
// Memberships.ChangeRole without requiring trip ownership (admin scope).
func (m *Module) handleAdminChangeRole(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())
	tripID := r.PathValue("tripID")
	userID := r.PathValue("userID")
	if tripID == "" || userID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID or userID"))
		return
	}

	var req changeRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "invalid request body"))
		return
	}
	role := Role(req.Role)
	if role != RoleEditor && role != RoleViewer && role != RoleOwner {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "role must be owner, editor or viewer"))
		return
	}

	if err := m.memberships.ChangeRole(r.Context(), tripID, userID, role); err != nil {
		if errors.Is(err, ErrMembershipNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "membership not found"))
			return
		}
		log.Error("admin change role", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not change role"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleAdminRevokeAccess revokes a user's access to a trip. It reuses
// Memberships.Revoke without requiring trip ownership (admin scope).
func (m *Module) handleAdminRevokeAccess(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())
	tripID := r.PathValue("tripID")
	userID := r.PathValue("userID")
	if tripID == "" || userID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "bad_request", "missing tripID or userID"))
		return
	}

	if err := m.memberships.Revoke(r.Context(), tripID, userID); err != nil {
		if errors.Is(err, ErrMembershipNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "membership not found"))
			return
		}
		log.Error("admin revoke access", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "could not revoke access"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
