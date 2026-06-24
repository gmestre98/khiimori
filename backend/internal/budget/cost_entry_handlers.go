package budget

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// costEntryRequest is the wire shape for creating or updating a cost entry.
type costEntryRequest struct {
	Category   string  `json:"category"`
	Amount     float64 `json:"amount"`
	Note       string  `json:"note"`
	DayID      string  `json:"day_id,omitempty"`
	PlanItemID string  `json:"plan_item_id,omitempty"`
}

// costEntryResponse is the wire shape returned after a successful operation.
type costEntryResponse struct {
	ID         string  `json:"id"`
	TripID     string  `json:"trip_id"`
	DayID      string  `json:"day_id,omitempty"`
	PlanItemID string  `json:"plan_item_id,omitempty"`
	Category   string  `json:"category"`
	Amount     float64 `json:"amount"`
	Note       string  `json:"note"`
	CreatedAt  string  `json:"created_at"`
}

func entryToResponse(e CostEntry) costEntryResponse {
	return costEntryResponse{
		ID:         e.ID,
		TripID:     e.TripID,
		DayID:      e.DayID,
		PlanItemID: e.PlanItemID,
		Category:   string(e.Category),
		Amount:     e.Amount,
		Note:       e.Note,
		CreatedAt:  e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// handleCreateCostEntry handles POST /trips/{tripID}/cost-entries.
func (m *Module) handleCreateCostEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req costEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	input := CreateCostEntry{
		TripID:     tripID,
		DayID:      req.DayID,
		PlanItemID: req.PlanItemID,
		Category:   Category(req.Category),
		Amount:     req.Amount,
		Note:       req.Note,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	entry, err := m.store.CreateCostEntry(r.Context(), input)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: create cost entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	writeJSON(w, http.StatusCreated, entryToResponse(entry))
}

// handleUpdateCostEntry handles PATCH /trips/{tripID}/cost-entries/{entryID}.
func (m *Module) handleUpdateCostEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	entryID := r.PathValue("entryID")
	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req costEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	input := UpdateCostEntry{
		ID:       entryID,
		TripID:   tripID,
		Category: Category(req.Category),
		Amount:   req.Amount,
		Note:     req.Note,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	entry, err := m.store.UpdateCostEntry(r.Context(), input)
	if errors.Is(err, ErrCostEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "cost_entry_not_found", "cost entry not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: update cost entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	writeJSON(w, http.StatusOK, entryToResponse(entry))
}

// handleDeleteCostEntry handles DELETE /trips/{tripID}/cost-entries/{entryID}.
func (m *Module) handleDeleteCostEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	entryID := r.PathValue("entryID")
	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if err := m.store.DeleteCostEntry(r.Context(), entryID, tripID); errors.Is(err, ErrCostEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "cost_entry_not_found", "cost entry not found"))
		return
	} else if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: delete cost entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
