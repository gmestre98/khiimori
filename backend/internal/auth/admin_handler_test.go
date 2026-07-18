package auth

import (
	"context"
	"encoding/json"
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

func (f *adminFakeRepo) Reactivate(_ context.Context, _ string) error {
	return nil
}

func (f *adminFakeRepo) GetByID(_ context.Context, _ string) (User, error) {
	return f.user, nil
}

func (f *adminFakeRepo) UpdateProfile(_ context.Context, _ string, _ profilePatch) (User, error) {
	return f.user, nil
}

func (f *adminFakeRepo) ListUsers(_ context.Context) ([]AdminUserRow, error) {
	return []AdminUserRow{{ID: f.user.ID, Email: f.user.Email, Name: f.user.Name, IsAdmin: f.user.IsAdmin, Active: f.active}}, nil
}

func (f *adminFakeRepo) ListTrips(_ context.Context) ([]AdminTripRow, error) {
	return []AdminTripRow{}, nil
}

func (f *adminFakeRepo) Stats(_ context.Context) (AdminStats, error) {
	return AdminStats{
		Users:      AdminUserStats{Total: 1, Active: 1, Admins: 1},
		Trips:      AdminTripStats{Total: 0, Active: 0, Archived: 0},
		UserGrowth: []AdminMonthPoint{{Month: "2026-07", Count: 1}},
		TripGrowth: []AdminMonthPoint{{Month: "2026-07", Count: 0}},
	}, nil
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

// TestAdminListUsersReturnsJSON: GET /admin/users returns a JSON array for an admin.
func TestAdminListUsersReturnsJSON(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u1", Email: "admin@example.com", IsAdmin: true, Active: true}, true)

	req := httptest.NewRequest(http.MethodGet, AdminUsersPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u1"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(http.HandlerFunc(m.handleAdminListUsers)).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// TestAdminListTripsReturnsJSON: GET /admin/trips returns a JSON array for an admin.
func TestAdminListTripsReturnsJSON(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u1", IsAdmin: true, Active: true}, true)

	req := httptest.NewRequest(http.MethodGet, AdminTripsPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u1"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(http.HandlerFunc(m.handleAdminListTrips)).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// TestAdminStatsReturnsJSON: GET /admin/stats returns the aggregate snapshot.
func TestAdminStatsReturnsJSON(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u1", IsAdmin: true, Active: true}, true)

	req := httptest.NewRequest(http.MethodGet, AdminStatsPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u1"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(http.HandlerFunc(m.handleAdminStats)).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var got AdminStats
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got.Users.Total != 1 || got.Users.Admins != 1 {
		t.Errorf("users = %+v, want total=1 admins=1", got.Users)
	}
	if len(got.UserGrowth) != 1 {
		t.Errorf("user_growth len = %d, want 1", len(got.UserGrowth))
	}
}

// TestAdminStatsDeniesNonAdmin: GET /admin/stats returns 403 for a non-admin.
func TestAdminStatsDeniesNonAdmin(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u2", IsAdmin: false, Active: true}, true)

	req := httptest.NewRequest(http.MethodGet, AdminStatsPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u2"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(http.HandlerFunc(m.handleAdminStats)).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

// TestAdminListUsersDeniesNonAdmin: GET /admin/users returns 403 for non-admin.
func TestAdminListUsersDeniesNonAdmin(t *testing.T) {
	t.Parallel()

	m := adminModule(User{ID: "u2", IsAdmin: false, Active: true}, true)

	req := httptest.NewRequest(http.MethodGet, AdminUsersPath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, "u2"))
	rec := httptest.NewRecorder()
	m.RequireAdmin(http.HandlerFunc(m.handleAdminListUsers)).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}
