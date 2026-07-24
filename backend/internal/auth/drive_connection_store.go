package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
)

// ErrNoDriveConnection is returned when a user has not connected Google Drive.
var ErrNoDriveConnection = errors.New("auth: no drive connection")

// ErrDriveDisconnected is returned when the stored refresh token is no longer
// valid — the user revoked access at Google (the token endpoint answers
// invalid_grant). Callers surface this as "reconnect required" (M13.4).
var ErrDriveDisconnected = errors.New("auth: drive connection revoked or invalid")

// DriveConnection is the non-secret metadata about a user's Drive connection.
// It deliberately carries no token material.
type DriveConnection struct {
	UserID      string
	Scope       string
	FolderID    string // cached export-target folder; empty until Epic 03 resolves it
	ConnectedAt time.Time
}

// driveConnectionStore persists Drive connections (auth.google_drive_connections)
// with the refresh token encrypted at rest, and mints auto-refreshing token
// sources from them. It satisfies the S1 DriveConnector seam via Save.
type driveConnectionStore struct {
	pool    *pgxpool.Pool
	crypter *driveCrypter
	// oauthCfg is the Drive OAuth config (client id/secret/endpoint) used to build
	// a TokenSource from a stored refresh token. It carries no per-user state.
	oauthCfg oauth2.Config
}

// newDriveConnectionStore wires the store to the database, the token crypter, and
// the OAuth config used for token refresh.
func newDriveConnectionStore(pool *pgxpool.Pool, crypter *driveCrypter, oauthCfg oauth2.Config) *driveConnectionStore {
	return &driveConnectionStore{pool: pool, crypter: crypter, oauthCfg: oauthCfg}
}

// Save upserts a freshly-obtained Drive token for userID (the DriveConnector
// seam). The refresh token is encrypted before it touches the database. On a
// reconnect the row is updated in place; folder_id is preserved (not clobbered)
// so a previously-resolved export folder survives a re-consent.
func (s *driveConnectionStore) Save(ctx context.Context, userID string, tok *DriveToken) error {
	if tok == nil || tok.RefreshToken == "" {
		// Without a refresh token we cannot mint access tokens later — refuse
		// rather than store a useless row. (prompt=consent should always yield one.)
		return errors.New("auth: drive token has no refresh token")
	}
	enc, err := s.crypter.encrypt(tok.RefreshToken)
	if err != nil {
		return err
	}
	scope := driveFileScope
	if len(tok.Scopes) > 0 {
		scope = strings.Join(tok.Scopes, " ")
	}
	const q = `
		INSERT INTO auth.google_drive_connections
			(user_id, refresh_token_enc, scope, connected_at, updated_at)
		VALUES ($1, $2, $3, now(), now())
		ON CONFLICT (user_id) DO UPDATE
			SET refresh_token_enc = EXCLUDED.refresh_token_enc,
			    scope             = EXCLUDED.scope,
			    updated_at        = now()`
	if _, err := s.pool.Exec(ctx, q, userID, enc, scope); err != nil {
		return fmt.Errorf("auth: save drive connection: %w", err)
	}
	return nil
}

// Load returns the non-secret connection metadata for userID, or
// ErrNoDriveConnection if the user has not connected Drive.
func (s *driveConnectionStore) Load(ctx context.Context, userID string) (*DriveConnection, error) {
	const q = `
		SELECT user_id, scope, folder_id, connected_at
		  FROM auth.google_drive_connections
		 WHERE user_id = $1`
	var c DriveConnection
	err := s.pool.QueryRow(ctx, q, userID).Scan(&c.UserID, &c.Scope, &c.FolderID, &c.ConnectedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoDriveConnection
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load drive connection: %w", err)
	}
	return &c, nil
}

// Delete removes a user's Drive connection (disconnect). Deleting a non-existent
// connection is not an error (idempotent).
func (s *driveConnectionStore) Delete(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM auth.google_drive_connections WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("auth: delete drive connection: %w", err)
	}
	return nil
}

// SetFolderID caches the resolved export-target folder id for userID (Epic 03).
func (s *driveConnectionStore) SetFolderID(ctx context.Context, userID, folderID string) error {
	if _, err := s.pool.Exec(ctx,
		`UPDATE auth.google_drive_connections SET folder_id = $2, updated_at = now() WHERE user_id = $1`,
		userID, folderID); err != nil {
		return fmt.Errorf("auth: set drive folder: %w", err)
	}
	return nil
}

// TokenSource returns an auto-refreshing oauth2.TokenSource for userID, built
// from the stored (decrypted) refresh token. The source refreshes the access
// token on demand; if Google rotates the refresh token, the new value is
// re-encrypted and persisted (persist-on-refresh). A revoked token surfaces as
// ErrDriveDisconnected on first use.
//
// The returned source captures ctx for its HTTP calls, so build one per
// operation (e.g. per export request), not once for the process lifetime.
func (s *driveConnectionStore) TokenSource(ctx context.Context, userID string) (oauth2.TokenSource, error) {
	const q = `SELECT refresh_token_enc FROM auth.google_drive_connections WHERE user_id = $1`
	var enc []byte
	err := s.pool.QueryRow(ctx, q, userID).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoDriveConnection
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load drive token: %w", err)
	}
	refresh, err := s.crypter.decrypt(enc)
	if err != nil {
		return nil, err
	}
	base := s.oauthCfg.TokenSource(ctx, &oauth2.Token{RefreshToken: refresh})
	return &persistingTokenSource{
		base:        base,
		store:       s,
		userID:      userID,
		lastRefresh: refresh,
	}, nil
}

// persistingTokenSource wraps a base oauth2.TokenSource to (a) translate a
// revoked-token error into ErrDriveDisconnected and (b) persist a rotated
// refresh token back to the store so the next process/instance keeps working.
type persistingTokenSource struct {
	base        oauth2.TokenSource
	store       *driveConnectionStore
	userID      string
	lastRefresh string
}

// Token returns a valid access token, refreshing if needed.
func (p *persistingTokenSource) Token() (*oauth2.Token, error) {
	tok, err := p.base.Token()
	if err != nil {
		if isInvalidGrant(err) {
			return nil, ErrDriveDisconnected
		}
		return nil, err
	}
	// Google may rotate the refresh token; if so, persist the new one. Best-effort
	// with its own short-lived context so a cancelled request context can't drop
	// the write.
	if tok.RefreshToken != "" && tok.RefreshToken != p.lastRefresh {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := p.store.updateRefreshToken(ctx, p.userID, tok.RefreshToken); err == nil {
			p.lastRefresh = tok.RefreshToken
		}
	}
	return tok, nil
}

// updateRefreshToken re-encrypts and stores a rotated refresh token.
func (s *driveConnectionStore) updateRefreshToken(ctx context.Context, userID, refresh string) error {
	enc, err := s.crypter.encrypt(refresh)
	if err != nil {
		return err
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE auth.google_drive_connections SET refresh_token_enc = $2, updated_at = now() WHERE user_id = $1`,
		userID, enc); err != nil {
		return fmt.Errorf("auth: update drive refresh token: %w", err)
	}
	return nil
}

// isInvalidGrant reports whether err is Google's "invalid_grant" from a token
// refresh — the signal that the user revoked access (or the token expired).
func isInvalidGrant(err error) bool {
	var re *oauth2.RetrieveError
	if errors.As(err, &re) {
		return re.ErrorCode == "invalid_grant"
	}
	return false
}
