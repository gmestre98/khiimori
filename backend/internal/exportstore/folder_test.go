package exportstore

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/oauth2"
)

type fakeFolderMgr struct {
	createID     string
	createErr    error
	exists       bool
	existsErr    error
	createCalls  int
	existsCalls  int
	lastCreateNm string
}

func (m *fakeFolderMgr) CreateFolder(_ context.Context, _ oauth2.TokenSource, name string) (string, error) {
	m.createCalls++
	m.lastCreateNm = name
	return m.createID, m.createErr
}
func (m *fakeFolderMgr) FolderExists(_ context.Context, _ oauth2.TokenSource, _ string) (bool, error) {
	m.existsCalls++
	return m.exists, m.existsErr
}

type fakeFolderCache struct {
	id      string
	getErr  error
	setErr  error
	setCall struct {
		userID, folderID string
		called           bool
	}
}

func (c *fakeFolderCache) FolderID(context.Context, string) (string, error) { return c.id, c.getErr }
func (c *fakeFolderCache) SetFolderID(_ context.Context, userID, folderID string) error {
	c.setCall.userID, c.setCall.folderID, c.setCall.called = userID, folderID, true
	return c.setErr
}

func TestResolveFolder_SuppliedFolderWins(t *testing.T) {
	mgr := &fakeFolderMgr{}
	cache := &fakeFolderCache{id: "cached-should-be-ignored"}
	id, url, err := ResolveFolder(context.Background(), mgr, cache, nil, "u1", "picked-folder")
	if err != nil {
		t.Fatalf("ResolveFolder: %v", err)
	}
	if id != "picked-folder" {
		t.Errorf("id = %q, want the supplied folder", id)
	}
	if url != "https://drive.google.com/drive/folders/picked-folder" {
		t.Errorf("url = %q", url)
	}
	if mgr.createCalls != 0 || mgr.existsCalls != 0 || cache.setCall.called {
		t.Error("a supplied folder must not touch the cache or create anything")
	}
}

func TestResolveFolder_UsesCachedWhenItStillExists(t *testing.T) {
	mgr := &fakeFolderMgr{exists: true}
	cache := &fakeFolderCache{id: "cached-1"}
	id, _, err := ResolveFolder(context.Background(), mgr, cache, nil, "u1", "")
	if err != nil {
		t.Fatalf("ResolveFolder: %v", err)
	}
	if id != "cached-1" {
		t.Errorf("id = %q, want cached-1", id)
	}
	if mgr.createCalls != 0 {
		t.Error("should not create when the cached folder still exists")
	}
}

func TestResolveFolder_CreatesAndCachesWhenNoCache(t *testing.T) {
	mgr := &fakeFolderMgr{createID: "new-fold"}
	cache := &fakeFolderCache{id: ""}
	id, _, err := ResolveFolder(context.Background(), mgr, cache, nil, "u1", "")
	if err != nil {
		t.Fatalf("ResolveFolder: %v", err)
	}
	if id != "new-fold" {
		t.Errorf("id = %q, want new-fold", id)
	}
	if mgr.lastCreateNm != DefaultFolderName {
		t.Errorf("created folder name = %q, want %q", mgr.lastCreateNm, DefaultFolderName)
	}
	if !cache.setCall.called || cache.setCall.folderID != "new-fold" || cache.setCall.userID != "u1" {
		t.Errorf("new folder id not cached: %+v", cache.setCall)
	}
}

func TestResolveFolder_RecreatesWhenCachedDeleted(t *testing.T) {
	mgr := &fakeFolderMgr{exists: false, createID: "recreated"}
	cache := &fakeFolderCache{id: "stale-1"}
	id, _, err := ResolveFolder(context.Background(), mgr, cache, nil, "u1", "")
	if err != nil {
		t.Fatalf("ResolveFolder: %v", err)
	}
	if mgr.existsCalls != 1 || mgr.createCalls != 1 {
		t.Errorf("exists=%d create=%d, want 1/1 (check then recreate)", mgr.existsCalls, mgr.createCalls)
	}
	if id != "recreated" || cache.setCall.folderID != "recreated" {
		t.Errorf("did not recreate + recache: id=%q cached=%q", id, cache.setCall.folderID)
	}
}

func TestResolveFolder_PropagatesErrors(t *testing.T) {
	sentinel := errors.New("drive down")
	t.Run("cache get", func(t *testing.T) {
		_, _, err := ResolveFolder(context.Background(), &fakeFolderMgr{}, &fakeFolderCache{getErr: sentinel}, nil, "u", "")
		if !errors.Is(err, sentinel) {
			t.Errorf("err = %v", err)
		}
	})
	t.Run("create", func(t *testing.T) {
		_, _, err := ResolveFolder(context.Background(), &fakeFolderMgr{createErr: sentinel}, &fakeFolderCache{}, nil, "u", "")
		if !errors.Is(err, sentinel) {
			t.Errorf("err = %v", err)
		}
	})
	t.Run("exists error does not recreate", func(t *testing.T) {
		// A transient FolderExists failure must propagate, NOT recreate — otherwise
		// we'd orphan the cached folder and make a duplicate on every failed check.
		mgr := &fakeFolderMgr{existsErr: sentinel, createID: "must-not-be-used"}
		_, _, err := ResolveFolder(context.Background(), mgr, &fakeFolderCache{id: "cached-1"}, nil, "u", "")
		if !errors.Is(err, sentinel) {
			t.Errorf("err = %v, want the exists error", err)
		}
		if mgr.createCalls != 0 {
			t.Error("must not recreate the folder on a transient exists error")
		}
	})
}
