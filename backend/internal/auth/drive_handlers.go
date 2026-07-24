package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Drive-export authorization routes (M13.1). The connect flow is deliberately
// separate from sign-in: it requests the drive.file scope with offline access,
// runs only for an already-signed-in user, and never disturbs the session.
const (
	DriveStatusPath     = "/integrations/google-drive"
	DriveConnectPath    = "/integrations/google-drive/connect"
	DriveCallbackPath   = "/integrations/google-drive/callback"
	DriveDisconnectPath = "/integrations/google-drive/disconnect"
)

// handleDriveStatus reports whether the signed-in user has connected Google
// Drive. It never returns any token material — only the connected flag and,
// when connected, when it was connected. Registered behind RequireAuth.
func (m *Module) handleDriveStatus(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	resp := map[string]any{"connected": false}
	conn, err := m.driveConnections.Load(r.Context(), p.UserID)
	switch {
	case errors.Is(err, ErrNoDriveConnection):
		// not connected — resp stays {connected:false}
	case err != nil:
		platformlog.FromContext(r.Context()).Error("drive status: load connection", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not read Drive connection"))
		return
	default:
		resp["connected"] = true
		resp["connected_at"] = conn.ConnectedAt.UTC().Format(time.RFC3339)
		if conn.FolderID != "" {
			resp["folder_id"] = conn.FolderID
		}
	}
	writeDriveJSON(w, http.StatusOK, resp)
}

// handleDriveDisconnect revokes the user's Drive grant at Google (best-effort)
// and deletes the stored connection. Idempotent — disconnecting when not
// connected still returns 204. Registered behind RequireAuth.
func (m *Module) handleDriveDisconnect(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	// Revocation is best-effort: if Google is unreachable or the token is already
	// invalid we still remove our stored copy, so the user is disconnected on our
	// side regardless.
	if err := m.driveConnections.Revoke(r.Context(), p.UserID); err != nil {
		platformlog.FromContext(r.Context()).Error("drive disconnect: revoke", "err", err.Error())
	}
	if err := m.driveConnections.Delete(r.Context(), p.UserID); err != nil {
		platformlog.FromContext(r.Context()).Error("drive disconnect: delete", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "server_error", "could not disconnect Google Drive"))
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// writeDriveJSON writes a JSON body with no-store (these responses reflect
// per-user connection state and must never be cached in front of Firebase).
func writeDriveJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// DriveConnector consumes a freshly-obtained Drive token for a user. S1 wires a
// no-op default (the flow captures the token and hands it off); S2 replaces it
// with the encrypted token store. Returning an error fails the connect.
type DriveConnector func(ctx context.Context, userID string, tok *DriveToken) error

// handleDriveConnect starts the Drive authorization flow for the signed-in user:
// it mints a signed state binding that user and redirects to Google's consent
// screen. Registered behind RequireAuth, so a principal is always present.
func (m *Module) handleDriveConnect(w http.ResponseWriter, r *http.Request) {
	if !m.driveConfigured {
		m.failDriveConnect(w, r, http.StatusNotImplemented, "drive_not_configured",
			"Google Drive export is not configured")
		return
	}
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	state, err := m.driveState.sign(p.UserID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("drive connect: signing state", "err", err.Error())
		m.failDriveConnect(w, r, http.StatusInternalServerError, "drive_connect_failed",
			"could not start Google Drive authorization")
		return
	}
	http.Redirect(w, r, m.driveProvider.AuthCodeURL(state), http.StatusFound)
}

// handleDriveCallback completes the Drive authorization: it verifies the signed
// state (and that its bound user matches the session), exchanges the code, checks
// that drive.file was actually granted, and hands the token to the connector.
// Registered behind RequireAuth. Any failure lands the browser back on the app
// with a marker rather than a raw error.
func (m *Module) handleDriveCallback(w http.ResponseWriter, r *http.Request) {
	if !m.driveConfigured {
		m.failDriveConnect(w, r, http.StatusNotImplemented, "drive_not_configured",
			"Google Drive export is not configured")
		return
	}
	q := r.URL.Query()

	// Google may redirect back with an error (RFC 6749 §4.1.2.1). Only
	// access_denied means the user actively declined — everything else
	// (server_error, temporarily_unavailable, invalid_scope, …) is a transient
	// or configuration failure the user should be told to retry, not that they
	// declined.
	if e := q.Get("error"); e != "" {
		if e == "access_denied" {
			m.failDriveConnect(w, r, http.StatusBadRequest, "drive_consent_denied",
				"Google Drive authorization was declined")
			return
		}
		m.failDriveConnect(w, r, http.StatusBadGateway, "drive_connect_failed",
			"Google Drive authorization could not be completed")
		return
	}

	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	boundUser, err := m.driveState.verify(q.Get("state"))
	if err != nil || boundUser != p.UserID {
		// A bad/expired state, or one bound to a different user than the session,
		// is a CSRF/replay signal — reject without exchanging the code.
		m.failDriveConnect(w, r, http.StatusBadRequest, "drive_state_invalid",
			"Google Drive authorization could not be verified")
		return
	}

	tok, err := m.driveProvider.Exchange(r.Context(), q.Get("code"))
	if err != nil {
		// Fixed reason only — the error carries no token/code material (S5).
		platformlog.FromContext(r.Context()).Error("drive callback: code exchange", "err", err.Error())
		m.failDriveConnect(w, r, http.StatusBadGateway, "drive_connect_failed",
			"could not complete Google Drive authorization")
		return
	}
	if !hasScope(tok.Scopes, driveFileScope) {
		// The user unchecked the Drive permission on the consent screen.
		m.failDriveConnect(w, r, http.StatusForbidden, "drive_scope_missing",
			"the Google Drive permission was not granted")
		return
	}

	if err := m.onDriveConnected(r.Context(), p.UserID, tok); err != nil {
		platformlog.FromContext(r.Context()).Error("drive callback: persisting connection", "err", err.Error())
		m.failDriveConnect(w, r, http.StatusInternalServerError, "drive_connect_failed",
			"could not save the Google Drive connection")
		return
	}

	m.succeedDriveConnect(w, r)
}

// succeedDriveConnect returns the browser to the app's settings with a success
// marker, or acknowledges as JSON when no web app is configured.
func (m *Module) succeedDriveConnect(w http.ResponseWriter, r *http.Request) {
	if m.webAppURL != "" {
		http.Redirect(w, r, m.webAppURL+"/settings?drive=connected", http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"drive_connected"}`))
}

// failDriveConnect ends a failed Drive connect. In the browser flow it redirects
// back to the app's settings with a ?drive_error= marker; otherwise it renders a
// JSON API error. No connection is stored.
func (m *Module) failDriveConnect(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	if m.webAppURL != "" {
		http.Redirect(w, r, m.webAppURL+"/settings?drive_error="+url.QueryEscape(code), http.StatusFound)
		return
	}
	httpx.WriteError(w, r, httpx.NewAPIError(status, code, message))
}
