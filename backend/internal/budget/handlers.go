package budget

import (
	"context"
	"encoding/json"
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

// setBudgetLineRequest is the wire shape for setting/updating a budget line.
// Amounts are always EUR (PRD §5.4, §11.5); no currency field is accepted.
type setBudgetLineRequest struct {
	Category      string  `json:"category"`
	PlannedAmount float64 `json:"planned_amount"`
}

// budgetLineResponse is the wire shape returned after a successful upsert.
type budgetLineResponse struct {
	ID            string  `json:"id"`
	TripID        string  `json:"trip_id"`
	DayID         string  `json:"day_id,omitempty"` // absent for trip-level lines
	Category      string  `json:"category"`
	PlannedAmount float64 `json:"planned_amount"`
	ActualAmount  float64 `json:"actual_amount"`
}

func lineToResponse(bl BudgetLine) budgetLineResponse {
	return budgetLineResponse{
		ID:            bl.ID,
		TripID:        bl.TripID,
		DayID:         bl.DayID,
		Category:      string(bl.Category),
		PlannedAmount: bl.PlannedAmount,
		ActualAmount:  bl.ActualAmount,
	}
}

// checkAccess asks the Authorizer whether userID may write budget data for tripID.
// Returns a 404 on denial (to avoid leaking trip existence) and 500 on infrastructure error.
func (m *Module) checkAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanWrite(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("budget: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

// handleSetTripBudgetLine handles PUT /trips/{tripID}/budget-lines
// It upserts a trip-level budget line (day_id IS NULL).
func (m *Module) handleSetTripBudgetLine(w http.ResponseWriter, r *http.Request) {
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

	var req setBudgetLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	input := SetBudgetLine{
		TripID:        tripID,
		DayID:         "",
		Category:      Category(req.Category),
		PlannedAmount: req.PlannedAmount,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	bl, err := m.store.Upsert(r.Context(), input)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: upsert trip line", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, lineToResponse(bl))
}

// handleSetDayBudgetLine handles PUT /trips/{tripID}/days/{dayID}/budget-lines
// It upserts a per-day budget line.
func (m *Module) handleSetDayBudgetLine(w http.ResponseWriter, r *http.Request) {
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

	var req setBudgetLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	input := SetBudgetLine{
		TripID:        tripID,
		DayID:         dayID,
		Category:      Category(req.Category),
		PlannedAmount: req.PlannedAmount,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	bl, err := m.store.Upsert(r.Context(), input)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: upsert day line", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, lineToResponse(bl))
}
