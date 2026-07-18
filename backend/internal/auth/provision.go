package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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
	// Reactivate sets active=true on the user row, restoring sign-in. Returns
	// errUserNotFound if the id is unknown.
	Reactivate(ctx context.Context, id string) error
	// ListUsers returns all user rows for the admin backoffice (M08.5 S2).
	ListUsers(ctx context.Context) ([]AdminUserRow, error)
	// ListTrips returns all trips with owner email for the admin backoffice (M08.5 S2).
	ListTrips(ctx context.Context) ([]AdminTripRow, error)
	// Stats returns aggregate counts + 6-month growth for the admin dashboard.
	Stats(ctx context.Context) (AdminStats, error)
	// ListActivity returns the most recent cross-user events (sign-ups, new
	// trips, shares), newest first, capped at limit.
	ListActivity(ctx context.Context, limit int) ([]AdminActivityEvent, error)
}

// AdminUserRow is the projection of an auth.users row for the admin list.
type AdminUserRow struct {
	ID        string
	Email     string
	Name      string
	IsAdmin   bool
	Active    bool
	CreatedAt string // RFC3339 sign-up timestamp
	TripCount int    // trips owned by this user
}

// AdminTripRow is the projection of a trip.trips row for the admin list,
// joined with the owner's email from auth.users.
type AdminTripRow struct {
	ID          string
	Name        string
	OwnerID     string
	OwnerEmail  string
	StartDate   string
	EndDate     string
	Status      string
	MemberCount int // shared collaborators (rows in sharing.trip_memberships)
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

// Reactivate sets active=true on the user row, restoring sign-in. Returns
// errUserNotFound when no such row exists.
func (r *pgxUserRepo) Reactivate(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE auth.users SET active = true, updated_at = now() WHERE id = $1::uuid`, id)
	if err != nil {
		return fmt.Errorf("auth: reactivate user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errUserNotFound
	}
	return nil
}

// ListUsers returns all user rows ordered by email for the admin backoffice.
func (r *pgxUserRepo) ListUsers(ctx context.Context) ([]AdminUserRow, error) {
	// trip_count is a correlated count of trips owned by each user. trip.trips
	// has no FK to auth.users (schemas are decoupled), so this is a plain
	// subquery join on owner_id, not a referential one.
	rows, err := r.pool.Query(ctx, `
		SELECT u.id::text, u.email, u.name, u.is_admin, u.active,
		       to_char(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       (SELECT count(*) FROM trip.trips t WHERE t.owner_id = u.id)
		FROM auth.users u
		ORDER BY u.email`)
	if err != nil {
		return nil, fmt.Errorf("auth: list users: %w", err)
	}
	defer rows.Close()
	var out []AdminUserRow
	for rows.Next() {
		var u AdminUserRow
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.IsAdmin, &u.Active,
			&u.CreatedAt, &u.TripCount); err != nil {
			return nil, fmt.Errorf("auth: scan user row: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("auth: list users rows: %w", err)
	}
	return out, nil
}

// ListTrips returns all trips joined with the owner's email, ordered by created_at desc.
// The join crosses schemas (trip.trips and auth.users); the admin scope crosses
// user boundaries by design, and the endpoint is gated by RequireAdmin.
func (r *pgxUserRepo) ListTrips(ctx context.Context) ([]AdminTripRow, error) {
	const query = `
		SELECT t.id::text, t.name, t.owner_id::text,
		       COALESCE(u.email, ''), t.start_date::text, t.end_date::text, t.status,
		       (SELECT count(*) FROM sharing.trip_memberships m WHERE m.trip_id = t.id)
		FROM   trip.trips t
		LEFT JOIN auth.users u ON u.id = t.owner_id
		ORDER BY t.created_at DESC`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("auth: list trips: %w", err)
	}
	defer rows.Close()
	var out []AdminTripRow
	for rows.Next() {
		var tr AdminTripRow
		if err := rows.Scan(&tr.ID, &tr.Name, &tr.OwnerID, &tr.OwnerEmail,
			&tr.StartDate, &tr.EndDate, &tr.Status, &tr.MemberCount); err != nil {
			return nil, fmt.Errorf("auth: scan trip row: %w", err)
		}
		out = append(out, tr)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("auth: list trips rows: %w", err)
	}
	return out, nil
}

// Stats returns the aggregate counts and 6-month cumulative growth that back the
// admin Overview dashboard. Kept as three small read-only queries (two summaries
// + one growth series) rather than pulling every row into Go: the admin scope
// crosses user boundaries by design, and the endpoint is gated by RequireAdmin.
func (r *pgxUserRepo) Stats(ctx context.Context) (AdminStats, error) {
	var s AdminStats

	err := r.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE active),
		       count(*) FILTER (WHERE is_admin)
		FROM auth.users`).Scan(&s.Users.Total, &s.Users.Active, &s.Users.Admins)
	if err != nil {
		return AdminStats{}, fmt.Errorf("auth: user stats: %w", err)
	}

	err = r.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE status = 'active'),
		       count(*) FILTER (WHERE status <> 'active')
		FROM trip.trips`).Scan(&s.Trips.Total, &s.Trips.Active, &s.Trips.Archived)
	if err != nil {
		return AdminStats{}, fmt.Errorf("auth: trip stats: %w", err)
	}

	// Cumulative user + trip totals at the end of each of the last 6 months, so
	// the dashboard can draw a growth line. generate_series(5..0) yields the six
	// month buckets ending with the current one.
	const growthQuery = `
		WITH months AS (
		    SELECT date_trunc('month', now()) - (interval '1 month' * g) AS m
		    FROM generate_series(5, 0, -1) AS g
		)
		SELECT to_char(m, 'YYYY-MM'),
		       (SELECT count(*) FROM auth.users u WHERE u.created_at < m + interval '1 month'),
		       (SELECT count(*) FROM trip.trips t WHERE t.created_at < m + interval '1 month')
		FROM months
		ORDER BY m`
	rows, err := r.pool.Query(ctx, growthQuery)
	if err != nil {
		return AdminStats{}, fmt.Errorf("auth: growth stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var month string
		var users, trips int
		if err := rows.Scan(&month, &users, &trips); err != nil {
			return AdminStats{}, fmt.Errorf("auth: scan growth row: %w", err)
		}
		s.UserGrowth = append(s.UserGrowth, AdminMonthPoint{Month: month, Count: users})
		s.TripGrowth = append(s.TripGrowth, AdminMonthPoint{Month: month, Count: trips})
	}
	if err := rows.Err(); err != nil {
		return AdminStats{}, fmt.Errorf("auth: growth rows: %w", err)
	}
	return s, nil
}

// ListActivity merges the recent-event streams (sign-ups, new trips, shares)
// into one time-ordered feed via a single UNION so Postgres does the sort +
// limit. The admin scope crosses user boundaries by design (RequireAdmin).
func (r *pgxUserRepo) ListActivity(ctx context.Context, limit int) ([]AdminActivityEvent, error) {
	const query = `
		(SELECT 'signup' AS kind, u.email AS actor, '' AS target, u.created_at AS at
		   FROM auth.users u)
		UNION ALL
		(SELECT 'trip_created', COALESCE(o.email, ''), t.name, t.created_at
		   FROM trip.trips t LEFT JOIN auth.users o ON o.id = t.owner_id)
		UNION ALL
		(SELECT 'trip_shared', COALESCE(mu.email, ''), t.name, m.created_at
		   FROM sharing.trip_memberships m
		   JOIN trip.trips t ON t.id = m.trip_id
		   LEFT JOIN auth.users mu ON mu.id = m.user_id
		   WHERE m.role <> 'owner')
		ORDER BY at DESC
		LIMIT $1`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("auth: list activity: %w", err)
	}
	defer rows.Close()
	var out []AdminActivityEvent
	for rows.Next() {
		var e AdminActivityEvent
		var at time.Time
		if err := rows.Scan(&e.Kind, &e.Actor, &e.Target, &at); err != nil {
			return nil, fmt.Errorf("auth: scan activity row: %w", err)
		}
		e.At = at.UTC().Format(time.RFC3339)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("auth: activity rows: %w", err)
	}
	return out, nil
}
