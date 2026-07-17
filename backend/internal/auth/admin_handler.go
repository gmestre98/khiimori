package auth

import (
	"encoding/json"
	"errors"
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

// AdminStatsPath is the admin endpoint returning dashboard aggregates (M08.5 redesign).
const AdminStatsPath = "/admin/stats"

// AdminStats is the aggregate snapshot behind the admin Overview dashboard.
type AdminStats struct {
	Users      AdminUserStats    `json:"users"`
	Trips      AdminTripStats    `json:"trips"`
	UserGrowth []AdminMonthPoint `json:"user_growth"`
	TripGrowth []AdminMonthPoint `json:"trip_growth"`
}

// AdminUserStats counts users by state.
type AdminUserStats struct {
	Total  int `json:"total"`
	Active int `json:"active"`
	Admins int `json:"admins"`
}

// AdminTripStats counts trips by state.
type AdminTripStats struct {
	Total    int `json:"total"`
	Active   int `json:"active"`
	Archived int `json:"archived"`
}

// AdminMonthPoint is a single "YYYY-MM" → cumulative-count point on a growth line.
type AdminMonthPoint struct {
	Month string `json:"month"`
	Count int    `json:"count"`
}

// handleAdminStats returns aggregate counts + 6-month growth for the Overview
// dashboard (M08.5 redesign). Gated by RequireAdmin.
func (m *Module) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := m.repo.Stats(r.Context())
	if err != nil {
		platformlog.FromContext(r.Context()).Error("admin stats", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not load stats"))
		return
	}
	// Never emit a null array — the client expects [] for an empty series.
	if stats.UserGrowth == nil {
		stats.UserGrowth = []AdminMonthPoint{}
	}
	if stats.TripGrowth == nil {
		stats.TripGrowth = []AdminMonthPoint{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(stats)
}

// AdminUsersPath is the admin endpoint to list all users (S2).
const AdminUsersPath = "/admin/users"

// AdminTripsPath is the admin endpoint to list all trips (S2).
const AdminTripsPath = "/admin/trips"

// handleAdminListUsers returns all users for the admin backoffice (M08.5 S2).
func (m *Module) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := m.repo.ListUsers(r.Context())
	if err != nil {
		platformlog.FromContext(r.Context()).Error("admin list users", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not list users"))
		return
	}

	type userResp struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		Name      string `json:"name"`
		IsAdmin   bool   `json:"is_admin"`
		Active    bool   `json:"active"`
		Joined    string `json:"joined"`
		TripCount int    `json:"trip_count"`
	}
	out := make([]userResp, len(users))
	for i, u := range users {
		out[i] = userResp{
			ID:        u.ID,
			Email:     u.Email,
			Name:      u.Name,
			IsAdmin:   u.IsAdmin,
			Active:    u.Active,
			Joined:    u.CreatedAt,
			TripCount: u.TripCount,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(out)
}

// handleAdminListTrips returns all trips for the admin backoffice (M08.5 S2).
func (m *Module) handleAdminListTrips(w http.ResponseWriter, r *http.Request) {
	trips, err := m.repo.ListTrips(r.Context())
	if err != nil {
		platformlog.FromContext(r.Context()).Error("admin list trips", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not list trips"))
		return
	}

	type tripResp struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		OwnerID     string `json:"owner_id"`
		OwnerEmail  string `json:"owner_email"`
		StartDate   string `json:"start_date"`
		EndDate     string `json:"end_date"`
		Status      string `json:"status"`
		MemberCount int    `json:"member_count"`
	}
	out := make([]tripResp, len(trips))
	for i, t := range trips {
		out[i] = tripResp{
			ID:          t.ID,
			Name:        t.Name,
			OwnerID:     t.OwnerID,
			OwnerEmail:  t.OwnerEmail,
			StartDate:   t.StartDate,
			EndDate:     t.EndDate,
			Status:      t.Status,
			MemberCount: t.MemberCount,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(out)
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
		if errors.Is(err, errUserNotFound) {
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

// ReactivateUserPath is the admin endpoint to reactivate a user (M08.5 redesign).
const ReactivateUserPath = "/admin/users/{userID}/reactivate"

// handleAdminReactivateUser sets active=true on the given user, restoring their
// ability to sign in. The inverse of handleAdminDeactivateUser. Gated by
// RequireAdmin.
func (m *Module) handleAdminReactivateUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("userID")
	if userID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_request", "userID is required"))
		return
	}

	if err := m.repo.Reactivate(r.Context(), userID); err != nil {
		if errors.Is(err, errUserNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "not_found", "user not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("reactivating user", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not reactivate user"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"reactivated"}`))
}
