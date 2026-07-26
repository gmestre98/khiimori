package gdrive

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/oauth2"
)

// staticTS is an oauth2.TokenSource returning a fixed access token.
type staticTS struct{ tok string }

func (s staticTS) Token() (*oauth2.Token, error) {
	return &oauth2.Token{AccessToken: s.tok}, nil
}

// errTS is a TokenSource that always fails (e.g. a revoked grant).
type errTS struct{ err error }

func (e errTS) Token() (*oauth2.Token, error) { return nil, e.err }

// clientFor points a Client at a test server.
func clientFor(srv *httptest.Server) *Client {
	return &Client{httpClient: srv.Client(), baseURL: srv.URL}
}

func TestCreateDoc_UploadsHTMLAndReturnsIDAndLink(t *testing.T) {
	var gotAuth, gotCT, gotMethod, gotPath, gotQuery string
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotCT = r.Header.Get("Content-Type")
		gotMethod, gotPath, gotQuery = r.Method, r.URL.Path, r.URL.RawQuery
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"file-123","webViewLink":"https://docs.google.com/d/file-123"}`))
	}))
	defer srv.Close()

	id, link, err := clientFor(srv).CreateDoc(
		context.Background(), staticTS{tok: "at-1"}, "My Trip", "folder-9", []byte("<h1>Trip</h1>"))
	if err != nil {
		t.Fatalf("CreateDoc: %v", err)
	}
	if id != "file-123" || link != "https://docs.google.com/d/file-123" {
		t.Errorf("id/link = %q/%q", id, link)
	}
	if gotMethod != http.MethodPost || gotPath != "/upload/drive/v3/files" {
		t.Errorf("method/path = %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(gotQuery, "uploadType=multipart") {
		t.Errorf("query = %q, want uploadType=multipart", gotQuery)
	}
	if gotAuth != "Bearer at-1" {
		t.Errorf("auth = %q", gotAuth)
	}
	if !strings.HasPrefix(gotCT, "multipart/related; boundary=") {
		t.Errorf("content-type = %q, want multipart/related", gotCT)
	}
	sbody := string(body)
	if !strings.Contains(sbody, googleDocMIME) {
		t.Error("body missing the Google Doc mimeType (won't convert to a Doc)")
	}
	if !strings.Contains(sbody, `"folder-9"`) {
		t.Error("body missing the parent folder id")
	}
	if !strings.Contains(sbody, "<h1>Trip</h1>") {
		t.Error("body missing the HTML content part")
	}
}

func TestCreateDoc_OmitsParentsWhenNoFolder(t *testing.T) {
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"f1"}`))
	}))
	defer srv.Close()

	_, _, err := clientFor(srv).CreateDoc(context.Background(), staticTS{}, "T", "", []byte("x"))
	if err != nil {
		t.Fatalf("CreateDoc: %v", err)
	}
	if strings.Contains(string(body), "parents") {
		t.Error("no folder → metadata must not carry a parents field")
	}
}

func TestUpdateDoc_PatchesMediaInPlace(t *testing.T) {
	var gotMethod, gotPath, gotQuery, gotCT string
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotQuery, gotCT = r.Method, r.URL.Path, r.URL.RawQuery, r.Header.Get("Content-Type")
		body, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"file-123"}`))
	}))
	defer srv.Close()

	err := clientFor(srv).UpdateDoc(context.Background(), staticTS{tok: "at"}, "file-123", []byte("<p>new</p>"))
	if err != nil {
		t.Fatalf("UpdateDoc: %v", err)
	}
	if gotMethod != http.MethodPatch || gotPath != "/upload/drive/v3/files/file-123" {
		t.Errorf("method/path = %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(gotQuery, "uploadType=media") {
		t.Errorf("query = %q, want uploadType=media", gotQuery)
	}
	if gotCT != "text/html" {
		t.Errorf("content-type = %q, want text/html", gotCT)
	}
	if string(body) != "<p>new</p>" {
		t.Errorf("body = %q", string(body))
	}
}

func TestUpdateDoc_404IsErrDocMissing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	err := clientFor(srv).UpdateDoc(context.Background(), staticTS{}, "gone", []byte("x"))
	if !errors.Is(err, ErrDocMissing) {
		t.Errorf("err = %v, want ErrDocMissing", err)
	}
}

func TestDo_401And403AreErrUnauthorized(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(code)
		}))
		_, _, err := clientFor(srv).CreateDoc(context.Background(), staticTS{}, "T", "", []byte("x"))
		srv.Close()
		if !errors.Is(err, ErrUnauthorized) {
			t.Errorf("code %d: err = %v, want ErrUnauthorized", code, err)
		}
	}
}

func TestDo_OtherStatusIsGenericError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	_, _, err := clientFor(srv).CreateDoc(context.Background(), staticTS{}, "T", "", []byte("x"))
	if err == nil || errors.Is(err, ErrUnauthorized) || errors.Is(err, ErrDocMissing) {
		t.Errorf("err = %v, want a generic non-sentinel error", err)
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error should mention the status: %v", err)
	}
}

func TestCreateDoc_TokenSourceErrorPropagates(t *testing.T) {
	sentinel := errors.New("drive revoked")
	// No server needed — the token is fetched before any request.
	c := &Client{httpClient: http.DefaultClient, baseURL: "http://unused"}
	_, _, err := c.CreateDoc(context.Background(), errTS{err: sentinel}, "T", "", []byte("x"))
	if !errors.Is(err, sentinel) {
		t.Errorf("err = %v, want the token-source error", err)
	}
}

func TestCreateDoc_MissingIDInResponseErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"webViewLink":"x"}`))
	}))
	defer srv.Close()
	_, _, err := clientFor(srv).CreateDoc(context.Background(), staticTS{}, "T", "", []byte("x"))
	if err == nil || !strings.Contains(err.Error(), "no file id") {
		t.Errorf("err = %v, want a no-file-id error", err)
	}
}
