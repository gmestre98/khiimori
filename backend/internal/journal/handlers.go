package journal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// upsertEntryRequest is the wire shape for the idempotent save endpoint.
type upsertEntryRequest struct {
	Body    json.RawMessage `json:"body"`
	Rating  *int            `json:"rating,omitempty"`
	Weather string          `json:"weather,omitempty"`
	Mood    string          `json:"mood,omitempty"`
}

// journalEntryResponse is the wire shape returned after a successful operation.
type journalEntryResponse struct {
	ID        string          `json:"id"`
	DayID     string          `json:"day_id"`
	AuthorID  string          `json:"author_id"`
	Body      json.RawMessage `json:"body"`
	Rating    *int            `json:"rating,omitempty"`
	Weather   string          `json:"weather,omitempty"`
	Mood      string          `json:"mood,omitempty"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

func entryToResponse(e JournalEntry) journalEntryResponse {
	return journalEntryResponse{
		ID:        e.ID,
		DayID:     e.DayID,
		AuthorID:  e.AuthorID,
		Body:      e.Body,
		Rating:    e.Rating,
		Weather:   e.Weather,
		Mood:      e.Mood,
		CreatedAt: e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: e.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// checkAccess asks the Authorizer whether userID may access journal data for tripID.
// Returns 404 on denial and 500 on infrastructure error.
func (m *Module) checkAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanAccess(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("journal: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

// handleUpsertEntry handles PUT /trips/{tripID}/days/{dayID}/journal
// It idempotently creates or updates the day's single journal entry.
func (m *Module) handleUpsertEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req upsertEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	// Default to empty JSON object when no body supplied.
	body := req.Body
	if len(body) == 0 {
		body = json.RawMessage(`{}`)
	}

	input := UpsertEntry{
		DayID:    dayID,
		AuthorID: principal.UserID,
		Body:     body,
		Rating:   req.Rating,
		Weather:  req.Weather,
		Mood:     req.Mood,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	entry, err := m.store.UpsertEntry(r.Context(), input)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: upsert entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, entryToResponse(entry))
}

// handleGetEntry handles GET /trips/{tripID}/days/{dayID}/journal
// Returns the day's journal entry, or 404 if none exists yet.
func (m *Module) handleGetEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	entry, err := m.store.GetEntry(r.Context(), dayID)
	if errors.Is(err, ErrEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "entry_not_found", "no journal entry for this day"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: get entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, entryToResponse(entry))
}
