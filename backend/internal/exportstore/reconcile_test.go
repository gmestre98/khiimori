package exportstore

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/oauth2"
)

// fakeRepo is an in-memory mappingRepo.
type fakeRepo struct {
	m        map[string]Mapping // keyed by tripID|userID
	upserts  []Mapping
	getErr   error
	upsertEr error
}

func newFakeRepo() *fakeRepo { return &fakeRepo{m: map[string]Mapping{}} }

func (f *fakeRepo) key(t, u string) string { return t + "|" + u }
func (f *fakeRepo) Get(_ context.Context, t, u string) (Mapping, error) {
	if f.getErr != nil {
		return Mapping{}, f.getErr
	}
	m, ok := f.m[f.key(t, u)]
	if !ok {
		return Mapping{}, ErrNoMapping
	}
	return m, nil
}
func (f *fakeRepo) Upsert(_ context.Context, m Mapping) error {
	if f.upsertEr != nil {
		return f.upsertEr
	}
	f.upserts = append(f.upserts, m)
	f.m[f.key(m.TripID, m.UserID)] = m
	return nil
}

// fakeWriter records Drive calls and can inject an update error.
type fakeWriter struct {
	createID    string
	createLink  string
	createErr   error
	updateErr   error
	createCalls int
	updateCalls int
	updatedID   string
}

func (w *fakeWriter) CreateDoc(_ context.Context, _ oauth2.TokenSource, _, _ string, _ []byte) (string, string, error) {
	w.createCalls++
	return w.createID, w.createLink, w.createErr
}
func (w *fakeWriter) UpdateDoc(_ context.Context, _ oauth2.TokenSource, fileID string, _ []byte) error {
	w.updateCalls++
	w.updatedID = fileID
	return w.updateErr
}

func params() ReconcileParams {
	return ReconcileParams{TripID: "t1", UserID: "u1", Name: "Trip", FolderID: "fold", HTML: []byte("<h1>x</h1>")}
}

func TestReconcile_NoMappingCreatesAndSaves(t *testing.T) {
	repo := newFakeRepo()
	w := &fakeWriter{createID: "file-new", createLink: "https://doc/new"}

	m, err := Reconcile(context.Background(), repo, w, nil, params())
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if w.createCalls != 1 || w.updateCalls != 0 {
		t.Errorf("create=%d update=%d, want 1/0", w.createCalls, w.updateCalls)
	}
	if m.DriveFileID != "file-new" || m.DocURL != "https://doc/new" || m.FolderID != "fold" {
		t.Errorf("mapping = %+v", m)
	}
	if len(repo.upserts) != 1 {
		t.Errorf("want 1 upsert, got %d", len(repo.upserts))
	}
}

func TestReconcile_ExistingUpdatesInPlace(t *testing.T) {
	repo := newFakeRepo()
	_ = repo.Upsert(context.Background(), Mapping{TripID: "t1", UserID: "u1", DriveFileID: "file-old", DocURL: "https://doc/old", FolderID: "fold-old"})
	w := &fakeWriter{}

	m, err := Reconcile(context.Background(), repo, w, nil, params())
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if w.updateCalls != 1 || w.createCalls != 0 {
		t.Errorf("update=%d create=%d, want 1/0", w.updateCalls, w.createCalls)
	}
	if w.updatedID != "file-old" {
		t.Errorf("updated id = %q, want file-old", w.updatedID)
	}
	// Same file id + URL kept; not moved to the new folder on an in-place update.
	if m.DriveFileID != "file-old" || m.DocURL != "https://doc/old" || m.FolderID != "fold-old" {
		t.Errorf("mapping changed unexpectedly: %+v", m)
	}
}

func TestReconcile_DeletedDocRecreated(t *testing.T) {
	repo := newFakeRepo()
	_ = repo.Upsert(context.Background(), Mapping{TripID: "t1", UserID: "u1", DriveFileID: "file-gone", DocURL: "https://doc/gone"})
	w := &fakeWriter{updateErr: ErrDocMissing, createID: "file-fresh", createLink: "https://doc/fresh"}

	m, err := Reconcile(context.Background(), repo, w, nil, params())
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if w.updateCalls != 1 || w.createCalls != 1 {
		t.Errorf("update=%d create=%d, want 1/1 (update then recreate)", w.updateCalls, w.createCalls)
	}
	if m.DriveFileID != "file-fresh" {
		t.Errorf("mapping not updated to the recreated file: %+v", m)
	}
	// The mapping now points at the new file id.
	stored, _ := repo.Get(context.Background(), "t1", "u1")
	if stored.DriveFileID != "file-fresh" {
		t.Errorf("stored mapping = %q, want file-fresh", stored.DriveFileID)
	}
}

func TestReconcile_UpdateErrorPropagates(t *testing.T) {
	repo := newFakeRepo()
	_ = repo.Upsert(context.Background(), Mapping{TripID: "t1", UserID: "u1", DriveFileID: "f"})
	sentinel := errors.New("drive 500")
	w := &fakeWriter{updateErr: sentinel}

	if _, err := Reconcile(context.Background(), repo, w, nil, params()); !errors.Is(err, sentinel) {
		t.Errorf("err = %v, want the update error", err)
	}
	if w.createCalls != 0 {
		t.Error("a non-404 update error must not trigger a recreate")
	}
}

func TestReconcile_CreateErrorPropagates(t *testing.T) {
	repo := newFakeRepo()
	sentinel := errors.New("drive unauthorized")
	w := &fakeWriter{createErr: sentinel}

	if _, err := Reconcile(context.Background(), repo, w, nil, params()); !errors.Is(err, sentinel) {
		t.Errorf("err = %v, want the create error", err)
	}
	if len(repo.upserts) != 0 {
		t.Error("no mapping should be saved when create fails")
	}
}
