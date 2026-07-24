package auth

import (
	"context"
	"net/http"
	"net/url"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Drive-export authorization routes (M13.1). The connect flow is deliberately
// separate from sign-in: it requests the drive.file scope with offline access,
// runs only for an already-signed-in user, and never disturbs the session.
const (
	DriveConnectPath  = "/integrations/google-drive/connect"
	DriveCallbackPath = "/integrations/google-drive/callback"
)

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

	// The user may decline consent on Google's screen (error=access_denied).
	if e := q.Get("error"); e != "" {
		m.failDriveConnect(w, r, http.StatusBadRequest, "drive_consent_denied",
			"Google Drive authorization was declined")
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
