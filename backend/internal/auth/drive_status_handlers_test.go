package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

// fakeDriveRepo is a driveConnectionRepo stub for handler tests.
type fakeDriveRepo struct {
	conn        *DriveConnection
	loadErr     error
	revokeErr   error
	deleteErr   error
	revokeCalls int
	deleteCalls int
}

func (f *fakeDriveRepo) Save(context.Context, string, *DriveToken) error { return nil }
func (f *fakeDriveRepo) Load(context.Context, string) (*DriveConnection, error) {
	return f.conn, f.loadErr
}
func (f *fakeDriveRepo) Delete(context.Context, string) error              { f.deleteCalls++; return f.deleteErr }
func (f *fakeDriveRepo) Revoke(context.Context, string) error              { f.revokeCalls++; return f.revokeErr }
func (f *fakeDriveRepo) SetFolderID(context.Context, string, string) error { return nil }
func (f *fakeDriveRepo) TokenSource(context.Context, string) (oauth2.TokenSource, error) {
	return nil, nil
}

func TestDriveStatus_NotConnected(t *testing.T) {
	m := &Module{driveConfigured: true, driveConnections: &fakeDriveRepo{loadErr: ErrNoDriveConnection}}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveStatusPath, nil), "user-1")
	m.handleDriveStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["connected"] != false {
		t.Errorf("connected = %v, want false", body["connected"])
	}
	if _, hasAt := body["connected_at"]; hasAt {
		t.Error("connected_at must be absent when not connected")
	}
}

func TestDriveStatus_Connected(t *testing.T) {
	when := time.Date(2026, 7, 24, 10, 0, 0, 0, time.UTC)
	m := &Module{driveConfigured: true, driveConnections: &fakeDriveRepo{
		conn: &DriveConnection{UserID: "user-1", ConnectedAt: when, FolderID: "fold-1"},
	}}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveStatusPath, nil), "user-1")
	m.handleDriveStatus(rec, req)

	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["connected"] != true {
		t.Errorf("connected = %v, want true", body["connected"])
	}
	if body["connected_at"] != "2026-07-24T10:00:00Z" {
		t.Errorf("connected_at = %v, want RFC3339 UTC", body["connected_at"])
	}
	if body["folder_id"] != "fold-1" {
		t.Errorf("folder_id = %v, want fold-1", body["folder_id"])
	}
	// A status response must never carry token material.
	if _, leaked := body["refresh_token"]; leaked {
		t.Error("status leaked token material")
	}
}

func TestDriveDisconnect_RevokesAndDeletes(t *testing.T) {
	repo := &fakeDriveRepo{}
	m := &Module{driveConfigured: true, driveConnections: repo}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("POST", DriveDisconnectPath, nil), "user-1")
	m.handleDriveDisconnect(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if repo.revokeCalls != 1 || repo.deleteCalls != 1 {
		t.Errorf("revoke=%d delete=%d, want 1/1", repo.revokeCalls, repo.deleteCalls)
	}
}

func TestDriveDisconnect_RevokeFailureStillDeletes(t *testing.T) {
	// Best-effort revoke: a Google failure must not stop us removing the row.
	repo := &fakeDriveRepo{revokeErr: errors.New("google down")}
	m := &Module{driveConfigured: true, driveConnections: repo}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("POST", DriveDisconnectPath, nil), "user-1")
	m.handleDriveDisconnect(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 despite revoke failure", rec.Code)
	}
	if repo.deleteCalls != 1 {
		t.Errorf("delete calls = %d, want 1", repo.deleteCalls)
	}
}

func TestDriveDisconnect_DeleteFailureIs500(t *testing.T) {
	repo := &fakeDriveRepo{deleteErr: errors.New("db down")}
	m := &Module{driveConfigured: true, driveConnections: repo}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("POST", DriveDisconnectPath, nil), "user-1")
	m.handleDriveDisconnect(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 when delete fails", rec.Code)
	}
}
