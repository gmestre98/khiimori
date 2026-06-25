package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// adminFakeRepo is a stub userRepo for admin middleware tests. It satisfies both
// userRepo and profileStore.
type adminFakeRepo struct {
	user   User
	active bool
}

func (f *adminFakeRepo) Save(_ context.Context, _ provisionParams) (User, error) {
	return f.user, nil
}

func (f *adminFakeRepo) IsActive(_ context.Context, _ string) (bool, error) {
	return f.active, nil
}

func (f *adminFakeRepo) Deactivate(_ context.Context, _ string) error {
	return nil
}

func (f *adminFakeRepo) GetByID(_ context.Context, _ string) (User, error) {
	return f.user, nil
}

func (f *adminFakeRepo) UpdateProfile(_ context.Context, _ string, _ profilePatch) (User, error) {
	return f.user, nil
}

// adminModule builds a Module with sessions + a fake repo wired for admin tests.
func adminModule(u User, active bool) *Module {
	repo := &adminFakeRepo{user: u, active: active}
	return &Module{
		sessions: testSessions(),
		users:    repo,
		repo:     repo,
	}
}

// TestRequireAdminAllowsAdmin: an is_admin user reaches the protected handler.
func TestRequireAdminAllowsAdmin(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u1", IsAdmin: true, Active: true}, true)
	ran := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		ran = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u1"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for admin user", rec.Code)
	}
	if !ran {
		t.Fatal("handler did not run for admin user")
	}
}

// TestRequireAdminDeniesNonAdmin: a non-admin authenticated user gets 403.
func TestRequireAdminDeniesNonAdmin(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u2", IsAdmin: false, Active: true}, true)
	ran := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { ran = true })

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u2"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for non-admin user", rec.Code)
	}
	if ran {
		t.Fatal("handler ran for non-admin user — must not")
	}
}

// TestRequireAdminDeniesAnonymous: an unauthenticated request gets 401.
func TestRequireAdminDeniesAnonymous(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u3", IsAdmin: true, Active: true}, true)
	ran := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { ran = true })

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	// No session cookie.
	rec := httptest.NewRecorder()
	m.RequireAdmin(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 for anonymous request", rec.Code)
	}
	if ran {
		t.Fatal("handler ran for anonymous request — must not")
	}
}
