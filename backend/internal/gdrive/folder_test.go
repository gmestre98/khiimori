package gdrive

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateFolder_PostsFolderMetadata(t *testing.T) {
	var body []byte
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		body, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"folder-77"}`))
	}))
	defer srv.Close()

	id, err := clientFor(srv).CreateFolder(context.Background(), staticTS{tok: "at"}, "Khiimori travelogues")
	if err != nil {
		t.Fatalf("CreateFolder: %v", err)
	}
	if id != "folder-77" {
		t.Errorf("id = %q, want folder-77", id)
	}
	if gotPath != "/drive/v3/files" {
		t.Errorf("path = %q", gotPath)
	}
	s := string(body)
	if !strings.Contains(s, folderMIME) || !strings.Contains(s, "Khiimori travelogues") {
		t.Errorf("body missing folder mimeType/name: %s", s)
	}
}

func TestFolderExists_TrueForLiveFolder(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":"f1","trashed":false}`))
	}))
	defer srv.Close()
	ok, err := clientFor(srv).FolderExists(context.Background(), staticTS{}, "f1")
	if err != nil || !ok {
		t.Errorf("ok=%v err=%v, want true/nil", ok, err)
	}
}

func TestFolderExists_FalseWhenTrashed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":"f1","trashed":true}`))
	}))
	defer srv.Close()
	ok, err := clientFor(srv).FolderExists(context.Background(), staticTS{}, "f1")
	if err != nil || ok {
		t.Errorf("ok=%v err=%v, want false/nil for a trashed folder", ok, err)
	}
}

func TestFolderExists_FalseOn404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	ok, err := clientFor(srv).FolderExists(context.Background(), staticTS{}, "gone")
	if err != nil || ok {
		t.Errorf("ok=%v err=%v, want false/nil (404 → recreate)", ok, err)
	}
}
