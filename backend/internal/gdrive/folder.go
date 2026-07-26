package gdrive

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"golang.org/x/oauth2"
)

// folderMIME is the Drive MIME type for a folder.
const folderMIME = "application/vnd.google-apps.folder"

// CreateFolder creates a Drive folder named name in the user's My Drive and
// returns its file id. drive.file lets the app create and later reuse folders it
// made.
func (c *Client) CreateFolder(ctx context.Context, ts oauth2.TokenSource, name string) (folderID string, err error) {
	body, err := json.Marshal(map[string]any{"name": name, "mimeType": folderMIME})
	if err != nil {
		return "", err
	}
	url := c.baseURL + "/drive/v3/files?fields=id"
	resp, err := c.do(ctx, ts, "POST", url, "application/json; charset=UTF-8", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return "", fmt.Errorf("gdrive: decode create-folder response: %w", err)
	}
	if out.ID == "" {
		return "", errors.New("gdrive: create folder returned no id")
	}
	return out.ID, nil
}

// FolderExists reports whether folderID still names a live (non-trashed) file the
// app can see. A deleted/trashed folder — or one the app no longer has access to
// — returns false with no error, so the caller can recreate.
func (c *Client) FolderExists(ctx context.Context, ts oauth2.TokenSource, folderID string) (bool, error) {
	url := c.baseURL + "/drive/v3/files/" + folderID + "?fields=id,trashed"
	resp, err := c.do(ctx, ts, "GET", url, "", nil)
	if errors.Is(err, ErrDocMissing) {
		return false, nil // 404 — gone
	}
	if err != nil {
		return false, err
	}
	var out struct {
		Trashed bool `json:"trashed"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return false, fmt.Errorf("gdrive: decode folder response: %w", err)
	}
	return !out.Trashed, nil
}
