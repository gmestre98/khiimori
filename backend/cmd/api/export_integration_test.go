//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"golang.org/x/oauth2"

	"github.com/gmestre98/khiimori/backend/internal/exportstore"
	"github.com/gmestre98/khiimori/backend/internal/platform/authn"

	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/sharing"
)

// fakeDrive is an in-memory driveClient: it records calls and hands back stable
// ids so the export round-trip can be asserted without talking to Google.
type fakeDrive struct {
	mu         sync.Mutex
	createDoc  int
	updateDoc  int
	createFold int
	lastDocID  string
	lastFolder string
	updatedIDs []string
}

func (f *fakeDrive) CreateDoc(_ context.Context, _ oauth2.TokenSource, _, folderID string, _ []byte) (string, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.createDoc++
	f.lastFolder = folderID
	f.lastDocID = "doc-1"
	return f.lastDocID, "https://docs.google.com/d/doc-1", nil
}
func (f *fakeDrive) UpdateDoc(_ context.Context, _ oauth2.TokenSource, fileID string, _ []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateDoc++
	f.updatedIDs = append(f.updatedIDs, fileID)
	return nil
}
func (f *fakeDrive) CreateFolder(_ context.Context, _ oauth2.TokenSource, _ string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.createFold++
	return "folder-1", nil
}
func (f *fakeDrive) FolderExists(_ context.Context, _ oauth2.TokenSource, _ string) (bool, error) {
	return true, nil
}

// fakeTokens returns a static token source (the fake Drive ignores the token).
type fakeTokens struct{}

func (fakeTokens) DriveTokenSource(context.Context, string) (oauth2.TokenSource, error) {
	return oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "test"}), nil
}

// memFolderCache is an in-memory FolderCache.
type memFolderCache struct {
	mu sync.Mutex
	m  map[string]string
}

func (c *memFolderCache) FolderID(_ context.Context, userID string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.m[userID], nil
}
func (c *memFolderCache) SetFolderID(_ context.Context, userID, folderID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]string{}
	}
	c.m[userID] = folderID
	return nil
}

// exportServer builds a server that mounts the export endpoint (authenticated as
// callerID) with the given fake Drive, over the real DB-backed reader, authz,
// budget, and mapping store.
func exportServer(t *testing.T, callerID string, drive *fakeDrive) *httptest.Server {
	t.Helper()
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: callerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	authz := sharing.NewMembershipAuthorizer(authzTestPool)
	deps := exportDeps{
		pool:    authzTestPool,
		authz:   authz,
		tokens:  fakeTokens{},
		folders: &memFolderCache{},
		budget: budget.New(authzTestPool, requireAuth, membershipBudgetAuthzAdapter{authz},
			tripCostReaderAdapter{pool: authzTestPool}),
		drive:    drive,
		mappings: exportstore.New(authzTestPool),
	}
	mux := http.NewServeMux()
	registerExportRoutes(mux, requireAuth, true, deps)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestIntegrationExport_CreatesThenUpdatesSameDoc(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	owner := genID(t)
	tripID := setupTrip(t, owner) // creates the trip + its days
	drive := &fakeDrive{}
	srv := exportServer(t, owner, drive)

	// First export → creates the Doc + folder, writes the mapping.
	r1 := do(t, srv, http.MethodPost, "/trips/"+tripID+"/export/google-doc", map[string]any{})
	defer r1.Body.Close()
	if r1.StatusCode != http.StatusOK {
		t.Fatalf("first export status = %d, want 200", r1.StatusCode)
	}
	var body1 struct{ DocURL, FolderURL string }
	_ = json.NewDecoder(r1.Body).Decode(&body1)
	if body1.DocURL == "" || body1.FolderURL == "" {
		t.Errorf("missing doc/folder url: %+v", body1)
	}
	if drive.createDoc != 1 || drive.createFold != 1 {
		t.Errorf("first export: createDoc=%d createFolder=%d, want 1/1", drive.createDoc, drive.createFold)
	}

	// The mapping row exists and points at the created doc.
	var fileID string
	if err := authzTestPool.QueryRow(context.Background(),
		`SELECT drive_file_id FROM trip.trip_exports WHERE trip_id=$1 AND user_id=$2`, tripID, owner).Scan(&fileID); err != nil {
		t.Fatalf("read mapping: %v", err)
	}
	if fileID != "doc-1" {
		t.Errorf("mapping drive_file_id = %q, want doc-1", fileID)
	}

	// Second export → updates the SAME doc in place (no new create), reusing the
	// cached folder (no second folder create).
	r2 := do(t, srv, http.MethodPost, "/trips/"+tripID+"/export/google-doc", map[string]any{})
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("second export status = %d, want 200", r2.StatusCode)
	}
	if drive.createDoc != 1 {
		t.Errorf("second export created a new doc (createDoc=%d), want it to update", drive.createDoc)
	}
	if drive.updateDoc != 1 || len(drive.updatedIDs) != 1 || drive.updatedIDs[0] != "doc-1" {
		t.Errorf("second export should update doc-1: updateDoc=%d ids=%v", drive.updateDoc, drive.updatedIDs)
	}
	if drive.createFold != 1 {
		t.Errorf("folder should be reused, createFolder=%d", drive.createFold)
	}
}

func TestIntegrationExport_NonMemberGets404(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	owner := genID(t)
	tripID := setupTrip(t, owner)
	stranger := genID(t)
	drive := &fakeDrive{}
	srv := exportServer(t, stranger, drive)

	r := do(t, srv, http.MethodPost, "/trips/"+tripID+"/export/google-doc", map[string]any{})
	defer r.Body.Close()
	if r.StatusCode != http.StatusNotFound {
		t.Errorf("non-member export status = %d, want 404", r.StatusCode)
	}
	if drive.createDoc != 0 {
		t.Error("a non-member export must not create a doc")
	}
}
