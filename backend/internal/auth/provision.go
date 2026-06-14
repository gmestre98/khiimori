package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// provisionParams is the set of identity-sourced fields written when
// provisioning a user. They come from a VerifiedIdentity (never client input);
// the server-set fields (default_currency=EUR, is_admin=false, empty prefs) are
// supplied by the auth.users column defaults, not by the caller.
type provisionParams struct {
	GoogleSub string
	Email     string
	Name      string
	Avatar    string
}

// userRepo persists provisioned users. The concrete pgxUserRepo writes to
// Postgres; unit tests supply a fake, so the provisioning policy can be tested
// without a database.
type userRepo interface {
	// Save persists the user identified by in.GoogleSub and returns the stored
	// row. On first sign-in it creates the row (S2); S3 extends it to resolve and
	// refresh an existing row keyed on google_sub.
	Save(ctx context.Context, in provisionParams) (User, error)
}

// Provisioner turns a verified identity into a persisted user. It is the seam
// the OAuth callback hands a VerifiedIdentity to (Epic 01 → Epic 02), and the
// place identity policy lives (the admin bootstrap arrives in S4).
type Provisioner struct {
	repo userRepo
}

// Provision creates (S2) — and from S3, resolves — the user backing a verified
// sign-in, returning the stored row for the caller to start a session from
// (Epic 03). EUR, an empty profile, and is_admin=false are applied server-side
// by the table defaults, never taken from the identity or any client input.
func (p *Provisioner) Provision(ctx context.Context, id VerifiedIdentity) (User, error) {
	// provisionParams mirrors the identity-sourced fields of VerifiedIdentity, so
	// the conversion stays valid until they diverge (S4 adds the computed admin
	// flag, at which point this becomes an explicit build).
	return p.repo.Save(ctx, provisionParams(id))
}

// pgxUserRepo is the Postgres-backed userRepo, writing to auth.users.
type pgxUserRepo struct {
	pool *pgxpool.Pool
}

// saveColumns is the column list returned by Save, in scan order. Centralised so
// the INSERT and the row scan can't drift apart.
const saveColumns = `id::text, google_sub, email, name, avatar, home_base, default_currency, prefs, is_admin`

// Save inserts a new user from the identity fields and returns the stored row.
// default_currency (EUR), prefs ('{}'), and is_admin (false) are left to the
// column defaults so they are fixed server-side. The single INSERT is its own
// transaction: the row — which carries the empty profile — is committed
// atomically or not at all, so a user never exists without a profile (PRD §5.8).
//
// This create-only form errors on a duplicate google_sub; S3 turns it into an
// upsert so a returning sign-in resolves to the same row.
func (r *pgxUserRepo) Save(ctx context.Context, in provisionParams) (User, error) {
	const query = `
		INSERT INTO auth.users (google_sub, email, name, avatar)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + saveColumns

	var u User
	err := r.pool.QueryRow(ctx, query, in.GoogleSub, in.Email, in.Name, in.Avatar).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.Avatar,
		&u.HomeBase, &u.DefaultCurrency, &u.Prefs, &u.IsAdmin,
	)
	if err != nil {
		// Wrap with a fixed message; the identity fields (incl. email) must not
		// reach logs via an error string (S5 no-logging guarantee).
		return User{}, fmt.Errorf("auth: save user: %w", err)
	}
	return u, nil
}
