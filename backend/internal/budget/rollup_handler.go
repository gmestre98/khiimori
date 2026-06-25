package budget

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// handleGetRollup handles GET /trips/{tripID}/budget/rollup.
// It computes actual spend per category/day/trip by aggregating Stay costs,
// PlanItem costs (via TripCostReader), and manual CostEntry rows.
func (m *Module) handleGetRollup(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkReadAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	external, err := m.costReader.GetTripCosts(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: get trip costs", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	entries, err := m.store.ListCostEntries(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: list cost entries", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	lines, err := m.store.ListBudgetLines(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("budget: list budget lines", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, computeRollup(external, entries, lines))
}
