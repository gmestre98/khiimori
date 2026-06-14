package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// defaultTheme is returned when a user has not chosen a theme yet. "system"
// follows the device preference. Allowed values are validated on edit (S2).
const defaultTheme = "system"

// ProfilePath is the authenticated profile endpoint: GET reads the signed-in
// user's profile, PATCH (S2) edits the editable fields. The user is always the
// session user — no id is ever taken from the client.
const ProfilePath = "/me"

// errUserNotFound means a valid session referenced a user row that no longer
// exists (e.g. deleted out-of-band). Treated as unauthenticated.
var errUserNotFound = errors.New("auth: user not found")

// profileStore is the subset of user persistence the profile endpoints need:
// read (S1) and, from S2, update — both keyed on the session user's id. The
// concrete pgxUserRepo implements it; tests supply a fake.
type profileStore interface {
	GetByID(ctx context.Context, id string) (User, error)
}

// profileResponse is the stable wire shape the frontend (Epic 05) consumes. It
// carries the editable fields (name, avatar, home_base, theme), the read-only
// Google email, and the fixed default_currency (always EUR, S3).
type profileResponse struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	Avatar          string `json:"avatar"`
	HomeBase        string `json:"home_base"`
	Theme           string `json:"theme"`
	DefaultCurrency string `json:"default_currency"`
}

// newProfileResponse projects a User row into the profile wire shape, pulling
// the theme out of the prefs JSONB.
func newProfileResponse(u User) profileResponse {
	return profileResponse{
		Name:            u.Name,
		Email:           u.Email,
		Avatar:          u.Avatar,
		HomeBase:        u.HomeBase,
		Theme:           themeFromPrefs(u.Prefs),
		DefaultCurrency: u.DefaultCurrency,
	}
}

// themeFromPrefs reads the theme out of the prefs JSONB, falling back to the
// default when prefs is empty or has no theme set.
func themeFromPrefs(raw json.RawMessage) string {
	var p struct {
		Theme string `json:"theme"`
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &p)
	}
	if p.Theme == "" {
		return defaultTheme
	}
	return p.Theme
}

// handleProfileRead returns the authenticated user's profile. It runs behind
// RequireAuth, so the user id comes from the session principal — never from the
// client — and only ever the caller's own row is read (S4).
func (m *Module) handleProfileRead(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	user, err := m.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		if errors.Is(err, errUserNotFound) {
			// The session is valid but its user is gone — make the client re-auth.
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}
		platformlog.FromContext(r.Context()).Error("reading profile", "err", err.Error())
		httpx.WriteError(w, r, err) // generic 500, no internals leaked to the client
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(newProfileResponse(user))
}

// GetByID loads a user row by id (the session user's id). A missing row is
// reported as errUserNotFound so the caller can distinguish it from a real
// failure.
func (r *pgxUserRepo) GetByID(ctx context.Context, id string) (User, error) {
	const query = `SELECT ` + saveColumns + ` FROM auth.users WHERE id = $1::uuid`

	var u User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.Avatar,
		&u.HomeBase, &u.DefaultCurrency, &u.Prefs, &u.IsAdmin,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errUserNotFound
	}
	if err != nil {
		// pgx errors for a select-by-id carry the query and the id param, not PII,
		// so wrapping is safe to log; the client still gets a generic 500.
		return User{}, fmt.Errorf("auth: get user by id: %w", err)
	}
	return u, nil
}
