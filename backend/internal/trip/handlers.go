package trip

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// TripsPath is the trips collection endpoint: POST creates a trip for the
// authenticated user. Item operations (read/edit/archive/delete) hang off
// TripsPath + "/{id}" in later stories.
const TripsPath = "/trips"

// tripStore is the persistence surface the handlers use. The concrete
// pgxTripStore implements it; unit tests supply a fake, so the handler policy
// (owner from session, EUR/status server-set, validation) is tested without a
// database. Later stories widen this interface (read/edit/archive/delete).
type tripStore interface {
	Create(ctx context.Context, nt NewTrip) (Trip, error)
}

// createRequest is the create wire shape. owner_id, base_currency, and status are
// deliberately absent: the owner is the session user and EUR/active are applied
// server-side, so no client can set them (PRD §5.1).
type createRequest struct {
	Name         string   `json:"name"`
	Destinations []string `json:"destinations"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Cover        string   `json:"cover"`
}

// toNewTrip parses and validates the request into a NewTrip owned by ownerID. It
// returns a client-safe error (rendered as 400) when a field is missing or
// invalid.
func (req createRequest) toNewTrip(ownerID string) (NewTrip, error) {
	start, err := parseDate("start_date", req.StartDate)
	if err != nil {
		return NewTrip{}, err
	}
	end, err := parseDate("end_date", req.EndDate)
	if err != nil {
		return NewTrip{}, err
	}
	if err := validateTripFields(req.Name, req.Destinations, start, end, req.Cover); err != nil {
		return NewTrip{}, err
	}
	dests := req.Destinations
	if dests == nil {
		dests = []string{}
	}
	return NewTrip{
		OwnerID:      ownerID,
		Name:         req.Name,
		Destinations: dests,
		StartDate:    start,
		EndDate:      end,
		Cover:        req.Cover,
	}, nil
}

// tripResponse is the stable wire shape returned to the frontend (Epic 05).
// Dates are calendar dates (YYYY-MM-DD); timestamps are RFC3339. base_currency
// echoes the stored value (always EUR in v1) rather than a literal, so it stays
// correct if currency ever becomes configurable.
type tripResponse struct {
	ID           string   `json:"id"`
	OwnerID      string   `json:"owner_id"`
	Name         string   `json:"name"`
	Destinations []string `json:"destinations"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	BaseCurrency string   `json:"base_currency"`
	Cover        string   `json:"cover"`
	Status       string   `json:"status"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

// newTripResponse projects a Trip into the wire shape, formatting dates and
// timestamps. destinations is normalised to [] (never null) so clients get a
// stable array type.
func newTripResponse(t Trip) tripResponse {
	dests := t.Destinations
	if dests == nil {
		dests = []string{}
	}
	return tripResponse{
		ID:           t.ID,
		OwnerID:      t.OwnerID,
		Name:         t.Name,
		Destinations: dests,
		StartDate:    t.StartDate.Format(dateLayout),
		EndDate:      t.EndDate.Format(dateLayout),
		BaseCurrency: t.BaseCurrency,
		Cover:        t.Cover,
		Status:       t.Status,
		CreatedAt:    t.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:    t.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// handleCreate creates a trip for the authenticated user. It runs behind
// RequireAuth, so the owner id comes from the session principal — never the
// client. EUR and active status are applied server-side by the store/column
// defaults. The owner TripMembership is written in the same transaction (the
// store), so a created trip always has its owner row.
func (m *Module) handleCreate(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	nt, err := req.toNewTrip(p.UserID)
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_trip", err.Error()))
		return
	}

	t, err := m.store.Create(r.Context(), nt)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("creating trip", "err", err.Error())
		httpx.WriteError(w, r, err) // generic 500; no internals leaked to the client
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(newTripResponse(t))
}
