//go:build integration

// Integration tests for the profile store (M02.4 S4). They run the real
// pgxUserRepo GetByID/UpdateProfile against a migrated auth schema on a
// disposable database, proving the actual SQL — COALESCE partial updates, the
// jsonb_set theme merge, EUR immutability, the id::uuid lookup, and the
// not-found path — end to end, not just against the fake. Gated behind the
// "integration" build tag; see provision_integration_test.go for the harness
// (TestMain migrates/rolls back; freshRepo truncates between tests).
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func strptr(s string) *string { return &s }

// TestIntegrationProfileReadAndUpdate: provision a user, then read and edit the
// profile through the real repo, asserting the SQL behaviour.
func TestIntegrationProfileReadAndUpdate(t *testing.T) {
	repo := freshRepo(t)
	ctx := context.Background()
	p := &Provisioner{repo: repo}

	user, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-1", Email: "ann@example.com", EmailVerified: true, Name: "Ann", Avatar: "https://a"})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}

	// Read: the provisioned defaults round-trip.
	got, err := repo.GetByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Name != "Ann" || got.DefaultCurrency != "EUR" || got.HomeBase != "" {
		t.Errorf("read = %+v, want Ann / EUR / empty home_base", got)
	}

	// Full edit: name, home_base, theme all change; avatar (not sent) is kept.
	updated, err := repo.UpdateProfile(ctx, user.ID, profilePatch{
		Name: strptr("Ann B."), HomeBase: strptr("Lisbon"), Theme: strptr("dark"),
	})
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.Name != "Ann B." || updated.HomeBase != "Lisbon" {
		t.Errorf("after edit = %+v, want Ann B. / Lisbon", updated)
	}
	if updated.Avatar != "https://a" {
		t.Errorf("avatar = %q, want it unchanged (not in the patch)", updated.Avatar)
	}
	if themeFromPrefs(updated.Prefs) != "dark" {
		t.Errorf("theme = %q, want dark", themeFromPrefs(updated.Prefs))
	}
	if updated.DefaultCurrency != "EUR" {
		t.Errorf("currency = %q, want EUR (immutable)", updated.DefaultCurrency)
	}

	// Partial edit: only theme; name/home_base/avatar stay; jsonb_set keeps it a
	// real object (no other keys to lose here, but the merge path is exercised).
	partial, err := repo.UpdateProfile(ctx, user.ID, profilePatch{Theme: strptr("light")})
	if err != nil {
		t.Fatalf("partial UpdateProfile: %v", err)
	}
	if partial.Name != "Ann B." || partial.HomeBase != "Lisbon" {
		t.Errorf("partial edit clobbered other fields: %+v", partial)
	}
	if themeFromPrefs(partial.Prefs) != "light" {
		t.Errorf("theme = %q, want light", themeFromPrefs(partial.Prefs))
	}
}

// TestIntegrationProfilePreservesOtherPrefKeys: a theme edit via jsonb_set keeps
// unrelated prefs keys intact (forward-compatibility of the JSONB bag).
func TestIntegrationProfilePreservesOtherPrefKeys(t *testing.T) {
	repo := freshRepo(t)
	ctx := context.Background()
	p := &Provisioner{repo: repo}

	user, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", EmailVerified: true, Name: "Ann"})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	// Seed an unrelated prefs key directly.
	if _, err := testPool.Exec(ctx,
		`UPDATE auth.users SET prefs = '{"experimental":true}'::jsonb WHERE id = $1::uuid`, user.ID); err != nil {
		t.Fatalf("seed prefs: %v", err)
	}

	updated, err := repo.UpdateProfile(ctx, user.ID, profilePatch{Theme: strptr("dark")})
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	var prefs struct {
		Theme        string `json:"theme"`
		Experimental bool   `json:"experimental"`
	}
	if err := json.Unmarshal(updated.Prefs, &prefs); err != nil {
		t.Fatalf("decode prefs: %v", err)
	}
	if prefs.Theme != "dark" || !prefs.Experimental {
		t.Errorf("prefs = %+v, want theme=dark and experimental preserved", prefs)
	}
}

// TestIntegrationProfileIsolation: an edit to one user's row never touches
// another's — the WHERE id = session-user clause scopes every write.
func TestIntegrationProfileIsolation(t *testing.T) {
	repo := freshRepo(t)
	ctx := context.Background()
	p := &Provisioner{repo: repo}

	a, err := p.Provision(ctx, VerifiedIdentity{GoogleSub: "sub-a", Email: "a@example.com", EmailVerified: true, Name: "Ann"})
	if err != nil {
		t.Fatalf("provision a: %v", err)
	}
	b, err := p.Provision(ctx, VerifiedIdentity{GoogleSub: "sub-b", Email: "b@example.com", EmailVerified: true, Name: "Bob"})
	if err != nil {
		t.Fatalf("provision b: %v", err)
	}

	if _, err := repo.UpdateProfile(ctx, a.ID, profilePatch{Name: strptr("Ann B."), HomeBase: strptr("Lisbon")}); err != nil {
		t.Fatalf("update a: %v", err)
	}

	gotB, err := repo.GetByID(ctx, b.ID)
	if err != nil {
		t.Fatalf("GetByID b: %v", err)
	}
	if gotB.Name != "Bob" || gotB.HomeBase != "" {
		t.Errorf("user b changed by an edit to user a: %+v", gotB)
	}
	if got := countUsers(t); got != 2 {
		t.Errorf("rows = %d, want 2", got)
	}
}

// TestIntegrationProfileMissingUser: GetByID / UpdateProfile for an unknown id
// report errUserNotFound (so a valid session over a deleted row → re-auth).
func TestIntegrationProfileMissingUser(t *testing.T) {
	repo := freshRepo(t)
	ctx := context.Background()
	const missing = "00000000-0000-0000-0000-000000000000"

	if _, err := repo.GetByID(ctx, missing); !errors.Is(err, errUserNotFound) {
		t.Errorf("GetByID(missing) err = %v, want errUserNotFound", err)
	}
	if _, err := repo.UpdateProfile(ctx, missing, profilePatch{Name: strptr("x")}); !errors.Is(err, errUserNotFound) {
		t.Errorf("UpdateProfile(missing) err = %v, want errUserNotFound", err)
	}
}
