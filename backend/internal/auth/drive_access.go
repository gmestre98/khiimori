package auth

import (
	"context"

	"golang.org/x/oauth2"
)

// Exported accessors the composition root uses to wire the Drive export endpoint
// (M13.3 S4) without reaching into the module's internals. They front the
// per-user Drive connection store; all return ErrNoDriveConnection when the user
// has not connected Drive (or the integration is unconfigured), which the export
// endpoint maps to a "connect Drive" 409.

// DriveConfigured reports whether the Drive integration is wired (credentials +
// redirect URI + token key + pool all present).
func (m *Module) DriveConfigured() bool { return m.driveConfigured }

// DriveTokenSource returns an auto-refreshing token source for the user's Drive
// connection, or ErrNoDriveConnection when they haven't connected.
func (m *Module) DriveTokenSource(ctx context.Context, userID string) (oauth2.TokenSource, error) {
	if m.driveConnections == nil {
		return nil, ErrNoDriveConnection
	}
	return m.driveConnections.TokenSource(ctx, userID)
}

// DriveFolderID returns the cached default-export-folder id for the user, or ""
// when none is cached (or they aren't connected).
func (m *Module) DriveFolderID(ctx context.Context, userID string) (string, error) {
	if m.driveConnections == nil {
		return "", nil
	}
	conn, err := m.driveConnections.Load(ctx, userID)
	if err == ErrNoDriveConnection {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return conn.FolderID, nil
}

// SetDriveFolderID caches the default-export-folder id for the user.
func (m *Module) SetDriveFolderID(ctx context.Context, userID, folderID string) error {
	if m.driveConnections == nil {
		return ErrNoDriveConnection
	}
	return m.driveConnections.SetFolderID(ctx, userID, folderID)
}
