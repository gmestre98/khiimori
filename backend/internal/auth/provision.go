package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// provisionParams is the set of fields written when provisioning a user. The
// identity fields come from a VerifiedIdentity (never client input). IsAdmin is
// the server-computed admin-bootstrap decision (S4), not a client value;
// default_currency=EUR and empty prefs are supplied by the auth.users column
// defaults.
type provisionParams struct {
	GoogleSub string
	Email     string
	Name      string
	Avatar    string
	// IsAdmin requests that this user be (or stay) an admin. It is true only when
	// the verified email matches the configured admin-bootstrap email; the upsert
	// treats it as promote-only and never demotes.
	IsAdmin bool
}

// userRepo persists provisioned users. The concrete pgxUserRepo writes to
// Postgres; unit tests supply a fake, so the provisioning policy can be tested
// without a database.
type userRepo interface {
	// Save provisions the user keyed on in.GoogleSub and returns the stored row:
	// it creates the row on first sign-in and resolves the existing row on a
	// returning sign-in (an upsert on the unique google_sub), refreshing the
	// identity fields without ever creating a duplicate.
	Save(ctx context.Context, in provisionParams) (User, error)
	// IsActive reports whether the user exists and has active=true. Used by
	// RequireAuth to reject deactivated users on every request (M08.5 S3).
	IsActive(ctx context.Context, id string) (bool, error)
	// Deactivate sets active=false on the user row, blocking further
	// authentication (M08.5 S3). Returns errUserNotFound if the id is unknown.
	Deactivate(ctx context.Context, id string) error
}

// Provisioner turns a verified identity into a persisted user. It is the seam
// the OAuth callback hands a VerifiedIdentity to (Epic 01 → Epic 02), and the
// place identity policy lives — including the admin bootstrap (S4).
type Provisioner struct {
	repo userRepo
	// adminEmail is the configured admin-bootstrap email (config.AdminEmail). When
	// it matches the verified identity's email (case-insensitively) the user is
	// provisioned as admin. Empty disables the bootstrap entirely. This is the
	// only path that sets is_admin — there is no public/self-serve route.
	adminEmail string
}

// Provision creates (S2) or resolves (S3) the user backing a verified sign-in,
// returning the stored row for the caller to start a session from (Epic 03).
// EUR and an empty profile are applied server-side by the table defaults, never
// taken from the identity or any client input. is_admin is decided here from
// the configured admin-bootstrap email (S4), not from anything client-supplied.
func (p *Provisioner) Provision(ctx context.Context, id VerifiedIdentity) (User, error) {
	return p.repo.Save(ctx, provisionParams{
		GoogleSub: id.GoogleSub,
		Email:     id.Email,
		Name:      id.Name,
		Avatar:    id.Avatar,
		IsAdmin:   p.bootstrapsAdmin(id),
	})
}

// bootstrapsAdmin reports whether this identity should be provisioned as admin:
// the bootstrap is configured (adminEmail set) and the identity's email is both
// Google-verified and a case-insensitive match (Google emails are). Requiring
// EmailVerified means an unverified email claim can never be used to assume the
// admin's privileges. An unset adminEmail matches no one, so by default every
// user is provisioned non-admin.
func (p *Provisioner) bootstrapsAdmin(id VerifiedIdentity) bool {
	return p.adminEmail != "" && id.EmailVerified && strings.EqualFold(id.Email, p.adminEmail)
}

// pgxUserRepo is the Postgres-backed userRepo, writing to auth.users.
type pgxUserRepo struct {
	pool *pgxpool.Pool
}

// saveColumns is the column list returned by Save, in scan order. Centralised so
// the INSERT and the row scan can't drift apart.
const saveColumns = `id::text, google_sub, email, name, avatar, home_base, default_currency, prefs, is_admin, active`

// Save upserts a user keyed on the unique google_sub: it inserts on first
// sign-in and, on a returning sign-in, resolves the existing row and refreshes
// only the identity-sourced fields (email/name/avatar). It never creates a
// duplicate even under concurrent first sign-ins — the unique constraint forces
// one INSERT and turns the other into the DO UPDATE.
//
// On insert, default_currency (EUR) and prefs ('{}') come from the column
// defaults, so they are fixed server-side; is_admin is set from the
// admin-bootstrap decision (in.IsAdmin). On update the identity fields are
// refreshed but the user-editable fields (home_base, prefs) are deliberately
// left untouched — google_sub is the stable key (email can change, so it is
// never the key) and a profile edit must survive an identity refresh (PRD §5.8).
// is_admin is OR-ed (promote-only): the bootstrap can grant admin on any
// sign-in but a sign-in never revokes it, so an admin whose Google email later
// changes away from ADMIN_EMAIL keeps the flag (revocation is a Milestone 08
// backoffice action, not a login side effect).
//
// The single statement is its own transaction, so the row that carries the
// empty profile commits atomically and a user never exists without a profile.
func (r *pgxUserRepo) Save(ctx context.Context, in provisionParams) (User, error) {
	const query = `
		INSERT INTO auth.users (google_sub, email, name, avatar, is_admin)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (google_sub) DO UPDATE
		SET email = EXCLUDED.email,
		    name = EXCLUDED.name,
		    avatar = EXCLUDED.avatar,
		    is_admin = auth.users.is_admin OR EXCLUDED.is_admin,
		    updated_at = now()
		RETURNING ` + saveColumns

	var u User
	err := r.pool.QueryRow(ctx, query, in.GoogleSub, in.Email, in.Name, in.Avatar, in.IsAdmin).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.Avatar,
		&u.HomeBase, &u.DefaultCurrency, &u.Prefs, &u.IsAdmin, &u.Active,
	)
	if err != nil {
		// Wrap with a fixed message; the identity fields (incl. email) must not
		// reach logs via an error string (S5 no-logging guarantee).
		return User{}, fmt.Errorf("auth: save user: %w", err)
	}
	return u, nil
}

// IsActive reports whether the user with the given id exists and has active=true.
// Missing users return false, nil — they are treated as inactive.
func (r *pgxUserRepo) IsActive(ctx context.Context, id string) (bool, error) {
	var active bool
	err := r.pool.QueryRow(ctx, `SELECT active FROM auth.users WHERE id = $1::uuid`, id).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("auth: is active: %w", err)
	}
	return active, nil
}

// Deactivate sets active=false on the user row with the given id. Returns
// errUserNotFound when no such row exists.
func (r *pgxUserRepo) Deactivate(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE auth.users SET active = false, updated_at = now() WHERE id = $1::uuid`, id)
	if err != nil {
		return fmt.Errorf("auth: deactivate user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errUserNotFound
	}
	return nil
}
