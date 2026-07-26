package exportstore

import (
	"context"
	"errors"

	"golang.org/x/oauth2"
)

// ErrDocMissing signals that an UpdateDoc targeted a document that no longer
// exists (the user trashed it), so Reconcile recreates it. It is part of the
// DocWriter contract: the composition root adapts the concrete Drive client's
// equivalent error to this sentinel (the modular-monolith boundary forbids this
// package importing the gdrive module directly).
var ErrDocMissing = errors.New("exportstore: document missing")

// DocWriter is the Drive operations Reconcile needs. The composition root
// satisfies it by adapting *gdrive.Client, translating its not-found error to
// ErrDocMissing.
type DocWriter interface {
	CreateDoc(ctx context.Context, ts oauth2.TokenSource, name, folderID string, html []byte) (fileID, webViewLink string, err error)
	// UpdateDoc replaces the doc's contents; it returns ErrDocMissing when the
	// target no longer exists.
	UpdateDoc(ctx context.Context, ts oauth2.TokenSource, fileID string, html []byte) error
}

// mappingRepo is the store surface Reconcile needs; *Store satisfies it. Kept as
// an interface so the reconcile branches are unit-testable with a fake.
type mappingRepo interface {
	Get(ctx context.Context, tripID, userID string) (Mapping, error)
	Upsert(ctx context.Context, m Mapping) error
}

var _ mappingRepo = (*Store)(nil)

// ReconcileParams describes the document to deliver.
type ReconcileParams struct {
	TripID   string
	UserID   string
	Name     string
	FolderID string
	HTML     []byte
}

// Reconcile delivers a freshly-rendered document to Drive while keeping exactly
// one Doc per (trip, user):
//   - no mapping yet        → create the Doc, then record the mapping;
//   - mapping exists         → update that Doc in place;
//   - the Doc was deleted    → (UpdateDoc → ErrDocMissing) recreate it and
//     (user trashed it)         overwrite the mapping with the new file id.
//
// It returns the resulting mapping (with a fresh last_exported_at). A revoked
// grant / auth failure surfaces via the writer or token source for the caller to
// map; storage and other Drive errors propagate.
func Reconcile(ctx context.Context, store mappingRepo, writer DocWriter, ts oauth2.TokenSource, p ReconcileParams) (Mapping, error) {
	existing, err := store.Get(ctx, p.TripID, p.UserID)
	if errors.Is(err, ErrNoMapping) {
		return createAndSave(ctx, store, writer, ts, p)
	}
	if err != nil {
		return Mapping{}, err
	}

	err = writer.UpdateDoc(ctx, ts, existing.DriveFileID, p.HTML)
	if errors.Is(err, ErrDocMissing) {
		// The user deleted/trashed the Doc — recreate it in the same folder.
		return createAndSave(ctx, store, writer, ts, p)
	}
	if err != nil {
		return Mapping{}, err
	}

	// Updated in place: the Doc keeps its file id, folder, and URL; only refresh
	// the export timestamp.
	if err := store.Upsert(ctx, existing); err != nil {
		return Mapping{}, err
	}
	return existing, nil
}

// createAndSave creates a new Doc and records the mapping.
func createAndSave(ctx context.Context, store mappingRepo, writer DocWriter, ts oauth2.TokenSource, p ReconcileParams) (Mapping, error) {
	fileID, webViewLink, err := writer.CreateDoc(ctx, ts, p.Name, p.FolderID, p.HTML)
	if err != nil {
		return Mapping{}, err
	}
	m := Mapping{
		TripID:      p.TripID,
		UserID:      p.UserID,
		DriveFileID: fileID,
		FolderID:    p.FolderID,
		DocURL:      webViewLink,
	}
	if err := store.Upsert(ctx, m); err != nil {
		return Mapping{}, err
	}
	return m, nil
}
