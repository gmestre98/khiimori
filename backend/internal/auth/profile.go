package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"

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

// profileStore is the subset of user persistence the profile endpoints need —
// read and update — both keyed on the session user's id. The concrete
// pgxUserRepo implements it; tests supply a fake.
type profileStore interface {
	GetByID(ctx context.Context, id string) (User, error)
	UpdateProfile(ctx context.Context, id string, p profilePatch) (User, error)
}

// Profile field bounds and the allowed theme values. Edits beyond these are
// rejected at the API boundary with a 400.
const (
	maxNameLen     = 200
	maxHomeBaseLen = 200
	maxAvatarLen   = 2048
)

var validThemes = map[string]bool{"system": true, "light": true, "dark": true}

// profilePatch is the editable profile fields. A nil pointer means "leave
// unchanged" (PATCH semantics), so a field is only touched when the client sends
// it. It is both the request wire shape and the store update input. Note there
// is no default_currency field — currency is immutable at the API boundary (S3).
type profilePatch struct {
	Name     *string `json:"name"`
	Avatar   *string `json:"avatar"`
	HomeBase *string `json:"home_base"`
	Theme    *string `json:"theme"`
}

// validate checks the provided fields. Absent (nil) fields are not validated.
func (p profilePatch) validate() error {
	if p.Name != nil && len(*p.Name) > maxNameLen {
		return fmt.Errorf("name must be at most %d characters", maxNameLen)
	}
	if p.HomeBase != nil && len(*p.HomeBase) > maxHomeBaseLen {
		return fmt.Errorf("home_base must be at most %d characters", maxHomeBaseLen)
	}
	if p.Avatar != nil && *p.Avatar != "" {
		if len(*p.Avatar) > maxAvatarLen {
			return fmt.Errorf("avatar must be at most %d characters", maxAvatarLen)
		}
		u, err := url.Parse(*p.Avatar)
		if err != nil || !u.IsAbs() || (u.Scheme != "http" && u.Scheme != "https") {
			return errors.New("avatar must be an absolute http(s) URL")
		}
	}
	if p.Theme != nil && !validThemes[*p.Theme] {
		return errors.New("theme must be one of system, light, dark")
	}
	return nil
}

// profileResponse is the stable wire shape the frontend (Epic 05) consumes. It
// carries the editable fields (name, avatar, home_base, theme), the read-only
// Google email, and default_currency.
//
// default_currency is read-only and always EUR in v1, enforced **server-side**,
// not just hidden in the UI (PRD §5.7): the column defaults to EUR, profilePatch
// has no currency field, and UpdateProfile never writes the column — so no
// request, however crafted, can change it. The field is kept in the model and
// response for forward-compatibility (PRD §11.5) and echoes the row value rather
// than a hardcoded literal, so it stays correct if currency ever becomes
// editable.
type profileResponse struct {
	ID              string `json:"id"`
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
		ID:              u.ID,
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

// handleProfileUpdate edits the editable profile fields of the signed-in user
// and returns the updated profile so the client reflects changes at once. Like
// the read, the target is always the session user's own row. default_currency is
// not editable here (S3) — it is simply not a field of profilePatch.
func (m *Module) handleProfileUpdate(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	var patch profilePatch
	// Unknown fields (e.g. default_currency) are ignored, not an error — currency
	// immutability is structural (it is not a field above), keeping the API
	// forward-compatible (S3).
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}
	if err := patch.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_profile", err.Error()))
		return
	}

	user, err := m.users.UpdateProfile(r.Context(), p.UserID, patch)
	if err != nil {
		if errors.Is(err, errUserNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}
		platformlog.FromContext(r.Context()).Error("updating profile", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(newProfileResponse(user))
}

// UpdateProfile applies a partial profile edit to the user's own row and returns
// the updated row. Absent (NULL) fields are kept via COALESCE; theme is merged
// into the prefs JSONB with jsonb_set so other prefs keys survive. Crucially,
// default_currency is never in the SET list — it stays EUR (S3). A missing row
// is reported as errUserNotFound.
func (r *pgxUserRepo) UpdateProfile(ctx context.Context, id string, p profilePatch) (User, error) {
	const query = `
		UPDATE auth.users
		SET name      = COALESCE($2, name),
		    avatar    = COALESCE($3, avatar),
		    home_base = COALESCE($4, home_base),
		    prefs     = CASE WHEN $5::text IS NULL THEN prefs
		                     ELSE jsonb_set(prefs, '{theme}', to_jsonb($5::text)) END,
		    updated_at = now()
		WHERE id = $1::uuid
		RETURNING ` + saveColumns

	var u User
	err := r.pool.QueryRow(ctx, query, id, p.Name, p.Avatar, p.HomeBase, p.Theme).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.Avatar,
		&u.HomeBase, &u.DefaultCurrency, &u.Prefs, &u.IsAdmin,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errUserNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("auth: update profile: %w", err)
	}
	return u, nil
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
