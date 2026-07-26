// Package gdrive is a minimal Google Drive client for the trip-export feature
// (M13.3). It creates and updates a Google Doc from HTML using nothing but the
// standard library over HTTPS — no google.golang.org/api dependency (milestone
// decision 2). It does exactly two things: create an HTML-sourced Doc and
// replace an existing Doc's contents.
package gdrive

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// googleDocMIME is the Drive MIME type that makes files.create convert the
// uploaded HTML into a native, editable Google Doc.
const googleDocMIME = "application/vnd.google-apps.document"

// defaultBaseURL is Google's upload endpoint host; overridable in tests.
const defaultBaseURL = "https://www.googleapis.com"

// requestTimeout bounds a single Drive call (an HTML upload + conversion).
const requestTimeout = 60 * time.Second

// Sentinel errors callers map to user-facing outcomes.
var (
	// ErrDocMissing means an update targeted a file that no longer exists (the
	// user trashed/deleted the Doc) — the caller recreates it.
	ErrDocMissing = errors.New("gdrive: document not found")
	// ErrUnauthorized means Drive rejected the access token (401/403). The caller
	// surfaces it as "reconnect Google Drive".
	ErrUnauthorized = errors.New("gdrive: unauthorized")
)

// Client talks to the Drive upload API. Construct it with NewClient.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// NewClient returns a Client with a bounded HTTP timeout, pointed at Google.
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: requestTimeout},
		baseURL:    defaultBaseURL,
	}
}

// CreateDoc uploads html as a new Google Doc named name, in the given Drive
// folder (empty folderID → the user's My Drive root), and returns the new file
// id and its webViewLink. ts supplies the access token (its refresh/rotation is
// the token source's concern; a Token() error — e.g. a revoked grant — is
// returned as-is for the caller to map).
func (c *Client) CreateDoc(ctx context.Context, ts oauth2.TokenSource, name, folderID string, html []byte) (fileID, webViewLink string, err error) {
	metadata := map[string]any{"name": name, "mimeType": googleDocMIME}
	if folderID != "" {
		metadata["parents"] = []string{folderID}
	}
	body, contentType, err := multipartRelated(metadata, html)
	if err != nil {
		return "", "", err
	}
	url := c.baseURL + "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink"
	resp, err := c.do(ctx, ts, http.MethodPost, url, contentType, body)
	if err != nil {
		return "", "", err
	}
	var out struct {
		ID          string `json:"id"`
		WebViewLink string `json:"webViewLink"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return "", "", fmt.Errorf("gdrive: decode create response: %w", err)
	}
	if out.ID == "" {
		return "", "", errors.New("gdrive: create returned no file id")
	}
	return out.ID, out.WebViewLink, nil
}

// UpdateDoc replaces the contents of an existing Doc (same id, name, and parents)
// with html. A 404 returns ErrDocMissing so the caller can recreate.
func (c *Client) UpdateDoc(ctx context.Context, ts oauth2.TokenSource, fileID string, html []byte) error {
	url := c.baseURL + "/upload/drive/v3/files/" + fileID + "?uploadType=media"
	_, err := c.do(ctx, ts, http.MethodPatch, url, "text/html", bytes.NewReader(html))
	return err
}

// do performs an authorized request and returns the response body, mapping
// Drive's error statuses to sentinels. It reads a bounded amount of the body.
func (c *Client) do(ctx context.Context, ts oauth2.TokenSource, method, url, contentType string, body io.Reader) ([]byte, error) {
	tok, err := ts.Token()
	if err != nil {
		return nil, err // e.g. a revoked grant from the token source; caller maps it
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gdrive: request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return data, nil
	case resp.StatusCode == http.StatusUnauthorized, resp.StatusCode == http.StatusForbidden:
		return nil, ErrUnauthorized
	case resp.StatusCode == http.StatusNotFound:
		return nil, ErrDocMissing
	default:
		// Include a bounded snippet of Drive's JSON error body — it names the
		// reason (bad metadata, unsupported conversion, quota) and carries none of
		// our secrets, making a prod failure debuggable.
		return nil, fmt.Errorf("gdrive: %s %s: HTTP %d: %s",
			method, endpointName(url), resp.StatusCode, snippet(data))
	}
}

// snippet returns a single-line, length-bounded view of a response body for use
// in error messages.
func snippet(b []byte) string {
	s := strings.TrimSpace(strings.ReplaceAll(string(b), "\n", " "))
	const max = 300
	if len(s) > max {
		s = s[:max] + "…"
	}
	return s
}

// multipartRelated builds a multipart/related body with a JSON metadata part and
// an HTML content part — the shape Drive's multipart upload expects.
func multipartRelated(metadata map[string]any, html []byte) (io.Reader, string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, "", err
	}
	metaHeader := textproto.MIMEHeader{"Content-Type": {"application/json; charset=UTF-8"}}
	part, err := w.CreatePart(metaHeader)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(metaJSON); err != nil {
		return nil, "", err
	}

	htmlHeader := textproto.MIMEHeader{"Content-Type": {"text/html; charset=UTF-8"}}
	part, err = w.CreatePart(htmlHeader)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(html); err != nil {
		return nil, "", err
	}
	if err := w.Close(); err != nil {
		return nil, "", err
	}
	// Drive expects multipart/related, not multipart/form-data; reuse the writer's
	// generated boundary.
	contentType := "multipart/related; boundary=" + w.Boundary()
	return &buf, contentType, nil
}

// endpointName trims the query string from url for error messages.
func endpointName(url string) string {
	if i := strings.IndexByte(url, '?'); i >= 0 {
		return url[:i]
	}
	return url
}
