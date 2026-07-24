//go:build integration

// Integration tests for the Drive connection store (M13.1 S2): they run the real
// pgx store against a migrated auth schema on a disposable database, proving the
// refresh token is stored encrypted, the upsert overwrites in place while
// preserving folder_id, delete is idempotent, and the persist-on-refresh path
// re-encrypts a rotated token. Gated behind the "integration" build tag; see
// provision_integration_test.go for the shared TestMain / pool setup.
package auth

import (
	"context"
	"testing"

	"golang.org/x/oauth2"
)

// freshDriveStore truncates auth.users (cascading to connections) and returns a
// store plus a provisioned user id to hang connections off (FK).
func freshDriveStore(t *testing.T) (*driveConnectionStore, string) {
	t.Helper()
	repo := freshRepo(t) // skips when no DB; truncates auth.users CASCADE
	u, err := (&Provisioner{repo: repo}).Provision(context.Background(), VerifiedIdentity{
		GoogleSub: "drive-sub", Email: "d@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("provision user: %v", err)
	}
	crypter, err := newDriveCrypter(testKeyB64(t))
	if err != nil {
		t.Fatalf("crypter: %v", err)
	}
	return newDriveConnectionStore(testPool, crypter, oauth2.Config{}), u.ID
}

// storedCiphertext returns the raw refresh_token_enc bytes for a user.
func storedCiphertext(t *testing.T, userID string) []byte {
	t.Helper()
	var enc []byte
	if err := testPool.QueryRow(context.Background(),
		`SELECT refresh_token_enc FROM auth.google_drive_connections WHERE user_id=$1`, userID).Scan(&enc); err != nil {
		t.Fatalf("read ciphertext: %v", err)
	}
	return enc
}

func TestIntegrationDriveStore_SaveEncryptsAtRest(t *testing.T) {
	s, uid := freshDriveStore(t)
	const refresh = "1//super-secret-refresh"

	if err := s.Save(context.Background(), uid, &DriveToken{RefreshToken: refresh, Scopes: []string{driveFileScope}}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	// The stored bytes must not contain the plaintext.
	if got := storedCiphertext(t, uid); string(got) == refresh || containsSub(got, refresh) {
		t.Fatal("refresh token stored in plaintext")
	}
	// Metadata loads without token material.
	conn, err := s.Load(context.Background(), uid)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if conn.Scope != driveFileScope {
		t.Errorf("scope = %q, want %q", conn.Scope, driveFileScope)
	}
}

func TestIntegrationDriveStore_UpsertOverwritesPreservingFolder(t *testing.T) {
	s, uid := freshDriveStore(t)
	ctx := context.Background()

	if err := s.Save(ctx, uid, &DriveToken{RefreshToken: "rt-1", Scopes: []string{driveFileScope}}); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if err := s.SetFolderID(ctx, uid, "folder-abc"); err != nil {
		t.Fatalf("SetFolderID: %v", err)
	}
	// Reconnect with a new refresh token — folder_id must survive.
	if err := s.Save(ctx, uid, &DriveToken{RefreshToken: "rt-2", Scopes: []string{driveFileScope}}); err != nil {
		t.Fatalf("second Save: %v", err)
	}
	conn, err := s.Load(ctx, uid)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if conn.FolderID != "folder-abc" {
		t.Errorf("folder_id = %q, want preserved folder-abc", conn.FolderID)
	}
	// And the stored token now decrypts to the new value.
	if pt, _ := s.crypter.decrypt(storedCiphertext(t, uid)); pt != "rt-2" {
		t.Errorf("stored refresh = %q, want rt-2", pt)
	}
}

func TestIntegrationDriveStore_DeleteIsIdempotent(t *testing.T) {
	s, uid := freshDriveStore(t)
	ctx := context.Background()
	if err := s.Save(ctx, uid, &DriveToken{RefreshToken: "rt", Scopes: []string{driveFileScope}}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := s.Delete(ctx, uid); err != nil {
		t.Fatalf("first Delete: %v", err)
	}
	if err := s.Delete(ctx, uid); err != nil {
		t.Fatalf("second Delete (idempotent): %v", err)
	}
	if _, err := s.Load(ctx, uid); err != ErrNoDriveConnection {
		t.Errorf("Load after delete: err = %v, want ErrNoDriveConnection", err)
	}
}

func TestIntegrationDriveStore_TokenSourceMissing(t *testing.T) {
	s, uid := freshDriveStore(t)
	if _, err := s.TokenSource(context.Background(), uid); err != ErrNoDriveConnection {
		t.Errorf("TokenSource with no connection: err = %v, want ErrNoDriveConnection", err)
	}
}

func TestIntegrationDriveStore_PersistOnRefresh(t *testing.T) {
	s, uid := freshDriveStore(t)
	ctx := context.Background()
	if err := s.Save(ctx, uid, &DriveToken{RefreshToken: "rt-old", Scopes: []string{driveFileScope}}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	// Simulate a refresh that rotated the refresh token.
	src := &persistingTokenSource{
		base:        &fakeBaseTS{tok: &oauth2.Token{AccessToken: "at", RefreshToken: "rt-new"}},
		store:       s,
		userID:      uid,
		lastRefresh: "rt-old",
	}
	if _, err := src.Token(); err != nil {
		t.Fatalf("Token: %v", err)
	}
	if pt, _ := s.crypter.decrypt(storedCiphertext(t, uid)); pt != "rt-new" {
		t.Errorf("rotated refresh not persisted: stored = %q, want rt-new", pt)
	}
}

// containsSub reports whether needle appears in haystack (small helper to avoid
// importing bytes for one call).
func containsSub(haystack []byte, needle string) bool {
	n := []byte(needle)
	if len(n) == 0 || len(n) > len(haystack) {
		return false
	}
	for i := 0; i+len(n) <= len(haystack); i++ {
		if string(haystack[i:i+len(n)]) == needle {
			return true
		}
	}
	return false
}
