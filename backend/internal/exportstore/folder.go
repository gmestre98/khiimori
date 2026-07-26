package exportstore

import (
	"context"

	"golang.org/x/oauth2"
)

// DefaultFolderName is the app-owned folder trip exports land in by default.
const DefaultFolderName = "Khiimori travelogues"

// FolderManager is the Drive folder operations ResolveFolder needs; the
// composition root adapts *gdrive.Client.
type FolderManager interface {
	CreateFolder(ctx context.Context, ts oauth2.TokenSource, name string) (folderID string, err error)
	FolderExists(ctx context.Context, ts oauth2.TokenSource, folderID string) (bool, error)
}

// FolderCache reads and writes the per-user cached default-folder id. The
// composition root adapts the auth module's Drive connection store (whose
// folder_id column caches it).
type FolderCache interface {
	// FolderID returns the cached default-folder id for the user, or "" if none.
	FolderID(ctx context.Context, userID string) (string, error)
	// SetFolderID caches the default-folder id for the user.
	SetFolderID(ctx context.Context, userID, folderID string) error
}

// ResolveFolder decides which Drive folder a user's export lands in and returns
// its id and a shareable URL:
//   - a supplied folderID (from the Google Picker, Epic 04) wins and is used
//     directly — the user granted the app access to exactly that folder;
//   - otherwise the app's default "Khiimori travelogues" folder is used, created
//     on first use and cached; a cached id that no longer exists (the user
//     deleted the folder) is recreated.
func ResolveFolder(ctx context.Context, mgr FolderManager, cache FolderCache, ts oauth2.TokenSource, userID, suppliedFolderID string) (folderID, folderURL string, err error) {
	if suppliedFolderID != "" {
		return suppliedFolderID, driveFolderURL(suppliedFolderID), nil
	}

	cached, err := cache.FolderID(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if cached != "" {
		exists, err := mgr.FolderExists(ctx, ts, cached)
		if err != nil {
			return "", "", err
		}
		if exists {
			return cached, driveFolderURL(cached), nil
		}
		// Cached folder was deleted/trashed — fall through and recreate.
	}

	id, err := mgr.CreateFolder(ctx, ts, DefaultFolderName)
	if err != nil {
		return "", "", err
	}
	if err := cache.SetFolderID(ctx, userID, id); err != nil {
		return "", "", err
	}
	return id, driveFolderURL(id), nil
}

// driveFolderURL is the browser URL for a Drive folder.
func driveFolderURL(id string) string {
	return "https://drive.google.com/drive/folders/" + id
}
