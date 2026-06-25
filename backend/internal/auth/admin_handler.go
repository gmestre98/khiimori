package auth

import (
	"encoding/json"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// AdminPath is the root of the admin backoffice API (M08.5).
const AdminPath = "/admin"

// handleAdminInfo returns a minimal acknowledgement that the caller is an admin.
// It is the health-check / shell for the admin backoffice (S1); the real reads
// and actions are added in S2/S3.
func (m *Module) handleAdminInfo(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	user, err := m.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("admin info: get user", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not load user"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"admin":    true,
		"user_id":  user.ID,
		"email":    user.Email,
		"is_admin": user.IsAdmin,
	})
}

// DeactivateUserPath is the admin endpoint to deactivate a user (S3).
const DeactivateUserPath = "/admin/users/{userID}/deactivate"

// handleAdminDeactivateUser sets active=false on the given user, blocking their
// future authentication (M08.5 S3). Gated by RequireAdmin.
func (m *Module) handleAdminDeactivateUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("userID")
	if userID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_request", "userID is required"))
		return
	}

	if err := m.repo.Deactivate(r.Context(), userID); err != nil {
		if err == errUserNotFound {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "not_found", "user not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("deactivating user", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not deactivate user"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"deactivated"}`))
}
