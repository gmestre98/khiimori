package trip

import (
	"context"
	"encoding/json"
	"errors"
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
// database. Later stories widen this interface (archive/delete).
type tripStore interface {
	Create(ctx context.Context, nt NewTrip) (Trip, error)
	Update(ctx context.Context, id, ownerID string, e EditTrip) (Trip, error)
}

// parseTripInput parses and validates the client-supplied trip fields shared by
// create and edit: it parses the wire dates, runs the shared field validation,
// and normalises destinations to a non-nil slice (so a nil never reaches the
// NOT NULL destinations column). It returns a client-safe error on the first
// problem.
func parseTripInput(name string, destinations []string, startStr, endStr, cover string) (dests []string, start, end time.Time, err error) {
	if start, err = parseDate("start_date", startStr); err != nil {
		return nil, time.Time{}, time.Time{}, err
	}
	if end, err = parseDate("end_date", endStr); err != nil {
		return nil, time.Time{}, time.Time{}, err
	}
	if err = validateTripFields(name, destinations, start, end, cover); err != nil {
		return nil, time.Time{}, time.Time{}, err
	}
	dests = destinations
	if dests == nil {
		dests = []string{}
	}
	return dests, start, end, nil
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
	dests, start, end, err := parseTripInput(req.Name, req.Destinations, req.StartDate, req.EndDate, req.Cover)
	if err != nil {
		return NewTrip{}, err
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

// editRequest is the edit wire shape. It mirrors createRequest's editable fields;
// owner_id, base_currency, and status are absent because they are immutable
// through an edit (enforced server-side, S3).
type editRequest struct {
	Name         string   `json:"name"`
	Destinations []string `json:"destinations"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Cover        string   `json:"cover"`
}

// toEditTrip parses and validates the request into an EditTrip. It returns a
// client-safe error (rendered as 400) when a field is missing or invalid.
func (req editRequest) toEditTrip() (EditTrip, error) {
	dests, start, end, err := parseTripInput(req.Name, req.Destinations, req.StartDate, req.EndDate, req.Cover)
	if err != nil {
		return EditTrip{}, err
	}
	return EditTrip{
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

// handleUpdate edits the editable fields of one of the authenticated user's
// trips. The trip id comes from the path; the owner is the session principal, so
// the store is owner-scoped and a trip that does not exist or belongs to another
// user is an indistinguishable 404 (never leaking its existence). base_currency
// stays EUR and owner_id is immutable — enforced by the store, not just by their
// absence from the request. A date-range change is surfaced to Epic 02's day
// generation inside the store's transaction.
func (m *Module) handleUpdate(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}

	id := r.PathValue("id")

	var req editRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	et, err := req.toEditTrip()
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_trip", err.Error()))
		return
	}

	t, err := m.store.Update(r.Context(), id, p.UserID, et)
	if err != nil {
		if errors.Is(err, errTripNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "trip_not_found", "trip not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("updating trip", "err", err.Error())
		httpx.WriteError(w, r, err) // generic 500; no internals leaked to the client
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(newTripResponse(t))
}
