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
// database. It mimics auth.users: Save creates a row keyed on google_sub with
// the server-set defaults the real table applies (EUR, empty prefs,
// is_admin=false). For S2's create-only contract it errors on a duplicate
// google_sub; S3 extends it to upsert.
type fakeUserRepo struct {
	bySub  map[string]User
	nextID int
	saves  int // number of Save calls, to assert no redundant writes
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{bySub: make(map[string]User)}
}

func (f *fakeUserRepo) Save(_ context.Context, in provisionParams) (User, error) {
	f.saves++
	if _, ok := f.bySub[in.GoogleSub]; ok {
		return User{}, errors.New("duplicate google_sub")
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
