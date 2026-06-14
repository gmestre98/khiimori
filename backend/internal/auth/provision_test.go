package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// errUserRepo is a userRepo whose Save always fails, for the provisioning-error
// path.
type errUserRepo struct{ err error }

func (e errUserRepo) Save(context.Context, provisionParams) (User, error) {
	return User{}, e.err
}

// newProvisioningModule builds a configured Module that provisions through the
// real completeSignIn seam, backed by the given repo and a fakeProvider that
// returns a fixed identity on Exchange.
func newProvisioningModule(repo userRepo) (*Module, *oauthStateStore) {
	store := newOAuthStateStore([]byte("test-key"), false)
	m := &Module{
		provider:    &fakeProvider{identity: VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann", Avatar: "https://pic"}},
		stateStore:  store,
		configured:  true,
		provisioner: &Provisioner{repo: repo},
	}
	m.onVerified = m.completeSignIn
	return m, store
}

// fakeUserRepo is an in-memory userRepo for unit-testing provisioning without a
// database. It mirrors the real upsert: Save creates a row keyed on google_sub
// with the server-set defaults the real table applies (EUR, empty prefs,
// is_admin=false) on first sign-in, and on a returning sign-in refreshes only
// the identity fields — preserving the id, the user-editable fields, and the
// admin flag, exactly as the ON CONFLICT DO UPDATE does.
type fakeUserRepo struct {
	bySub  map[string]User
	nextID int
	saves  int // number of Save calls, to tell creates from resolves
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{bySub: make(map[string]User)}
}

func (f *fakeUserRepo) Save(_ context.Context, in provisionParams) (User, error) {
	f.saves++
	if existing, ok := f.bySub[in.GoogleSub]; ok {
		// Returning sign-in: refresh the Google-sourced identity fields only.
		existing.Email = in.Email
		existing.Name = in.Name
		existing.Avatar = in.Avatar
		f.bySub[in.GoogleSub] = existing
		return existing, nil
	}
	f.nextID++
	u := User{
		ID:              fmt.Sprintf("user-%d", f.nextID),
		GoogleSub:       in.GoogleSub,
		Email:           in.Email,
		Name:            in.Name,
		Avatar:          in.Avatar,
		HomeBase:        "",
		DefaultCurrency: "EUR",
		Prefs:           json.RawMessage(`{}`),
		IsAdmin:         false,
	}
	f.bySub[in.GoogleSub] = u
	return u, nil
}

// TestProvisionCreatesUserWithDefaults: a first-time identity produces a user
// carrying the identity fields plus the server-set defaults (EUR currency,
// empty profile, non-admin), and the row is persisted.
func TestProvisionCreatesUserWithDefaults(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	p := &Provisioner{repo: repo}

	id := VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann", Avatar: "https://pic"}
	u, err := p.Provision(context.Background(), id)
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}

	// Identity fields are copied from the verified identity.
	if u.GoogleSub != id.GoogleSub || u.Email != id.Email || u.Name != id.Name || u.Avatar != id.Avatar {
		t.Errorf("identity fields = %+v, want them sourced from %+v", u, id)
	}
	// Server-set defaults — not taken from any client input.
	if u.DefaultCurrency != "EUR" {
		t.Errorf("DefaultCurrency = %q, want EUR", u.DefaultCurrency)
	}
	if u.IsAdmin {
		t.Error("IsAdmin = true, want false on a freshly provisioned user")
	}
	if u.HomeBase != "" {
		t.Errorf("HomeBase = %q, want empty on a freshly provisioned user", u.HomeBase)
	}
	if string(u.Prefs) != "{}" {
		t.Errorf("Prefs = %s, want {}", u.Prefs)
	}
	if u.ID == "" {
		t.Error("ID is empty, want a generated id")
	}

	// The user was persisted exactly once.
	if len(repo.bySub) != 1 {
		t.Errorf("persisted %d users, want 1", len(repo.bySub))
	}
}

// TestCallbackProvisionsUserAndAcks: a successful callback provisions the user
// (via the real completeSignIn seam) and acknowledges with signed_in.
func TestCallbackProvisionsUserAndAcks(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	m, store := newProvisioningModule(repo)

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"signed_in"`) {
		t.Errorf("body = %q, want a signed_in ack", rec.Body.String())
	}
	if _, ok := repo.bySub["sub-1"]; !ok || len(repo.bySub) != 1 {
		t.Errorf("expected the verified identity to be provisioned exactly once, got %d rows", len(repo.bySub))
	}
}

// TestCallbackProvisionFailureReturns500: when provisioning fails, the callback
// returns 500 with the stable code and does not sign the user in.
func TestCallbackProvisionFailureReturns500(t *testing.T) {
	t.Parallel()

	m, store := newProvisioningModule(errUserRepo{err: errors.New("db down")})

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code=auth-code", nil)
	req.AddCookie(cookie)
	rec := serve(m, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "auth_provision_failed") {
		t.Errorf("body = %q, want the auth_provision_failed code", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "signed_in") {
		t.Error("a failed provisioning must not return a signed_in ack")
	}
}

// TestProvisionResolvesReturningUser: a second sign-in with the same google_sub
// resolves to the same user — no new row is created.
func TestProvisionResolvesReturningUser(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	p := &Provisioner{repo: repo}
	id := VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann", Avatar: "https://pic"}

	first, err := p.Provision(context.Background(), id)
	if err != nil {
		t.Fatalf("first Provision: %v", err)
	}
	second, err := p.Provision(context.Background(), id)
	if err != nil {
		t.Fatalf("second Provision: %v", err)
	}

	if second.ID != first.ID {
		t.Errorf("returning sign-in got ID %q, want the same row %q", second.ID, first.ID)
	}
	if len(repo.bySub) != 1 {
		t.Errorf("rows = %d, want 1 (no duplicate on returning sign-in)", len(repo.bySub))
	}
	if repo.saves != 2 {
		t.Errorf("Save calls = %d, want 2 (both sign-ins went through the upsert)", repo.saves)
	}
}

// TestProvisionEmailChangeUpdatesNotDuplicate: a returning sign-in whose Google
// email/name/avatar changed updates the existing row (keyed on google_sub)
// rather than creating a duplicate.
func TestProvisionEmailChangeUpdatesNotDuplicate(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	p := &Provisioner{repo: repo}

	first, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "old@example.com", Name: "Old", Avatar: "https://old"})
	if err != nil {
		t.Fatalf("first Provision: %v", err)
	}

	updated, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "new@example.com", Name: "New", Avatar: "https://new"})
	if err != nil {
		t.Fatalf("second Provision: %v", err)
	}

	if updated.ID != first.ID {
		t.Errorf("email change created a new row (ID %q), want the same row %q", updated.ID, first.ID)
	}
	if len(repo.bySub) != 1 {
		t.Errorf("rows = %d, want 1 (email change must not duplicate)", len(repo.bySub))
	}
	if updated.Email != "new@example.com" || updated.Name != "New" || updated.Avatar != "https://new" {
		t.Errorf("identity not refreshed: %+v", updated)
	}
}

// TestProvisionPreservesUserEditableFieldsOnRefresh: an identity refresh updates
// only the Google-sourced fields; the user-editable profile (home_base, prefs)
// and the admin flag set out-of-band survive a returning sign-in.
func TestProvisionPreservesUserEditableFieldsOnRefresh(t *testing.T) {
	t.Parallel()

	repo := newFakeUserRepo()
	p := &Provisioner{repo: repo}

	created, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann", Avatar: "https://pic"})
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}

	// Simulate later edits the upsert must not clobber: a profile edit (Epic 04)
	// and the admin bootstrap (S4).
	stored := repo.bySub["sub-1"]
	stored.HomeBase = "Lisbon"
	stored.Prefs = json.RawMessage(`{"theme":"dark"}`)
	stored.IsAdmin = true
	repo.bySub["sub-1"] = stored

	refreshed, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", Name: "Ann Renamed", Avatar: "https://pic2"})
	if err != nil {
		t.Fatalf("re-Provision: %v", err)
	}

	if refreshed.ID != created.ID {
		t.Errorf("ID changed on refresh: got %q, want %q", refreshed.ID, created.ID)
	}
	if refreshed.HomeBase != "Lisbon" {
		t.Errorf("HomeBase = %q, want it preserved (Lisbon)", refreshed.HomeBase)
	}
	if string(refreshed.Prefs) != `{"theme":"dark"}` {
		t.Errorf("Prefs = %s, want them preserved", refreshed.Prefs)
	}
	if !refreshed.IsAdmin {
		t.Error("IsAdmin was reset on refresh, want it preserved")
	}
	if refreshed.Name != "Ann Renamed" || refreshed.Avatar != "https://pic2" {
		t.Errorf("identity fields not refreshed: %+v", refreshed)
	}
}
