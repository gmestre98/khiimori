package trip

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// TripsPath is the trips collection endpoint. Item operations hang off
// TripsPath+"/{id}"; day addressing hangs off TripsPath+"/{id}/days/{date}".
const TripsPath = "/trips"

// tripStore is the persistence surface the handlers use. The concrete
// pgxTripStore implements it; unit tests supply a fake, so the handler policy
// (owner from session, EUR/status server-set, validation) is tested without a
// database.
type tripStore interface {
	Create(ctx context.Context, nt NewTrip) (Trip, error)
	Update(ctx context.Context, id, ownerID string, e EditTrip) (Trip, error)
	Archive(ctx context.Context, id, ownerID string) (Trip, error)
	Unarchive(ctx context.Context, id, ownerID string) (Trip, error)
	Delete(ctx context.Context, id, ownerID string) error
	// GetDay fetches a single day by trip ownership + date for deep-linking.
	// ownerID scopes the lookup so a day in another user's trip is an
	// indistinguishable errDayNotFound.
	GetDay(ctx context.Context, tripID, ownerID, date string) (Day, error)
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
//
// ForceShrink bypasses the shrink guard: the client must set it to true after
// showing the user a confirmation dialog (the 409 days_have_data response tells
// them how many days hold data). Sending true without confirmation is an API
// misuse, not a security issue — the user's own data is destroyed, never
// another user's.
type editRequest struct {
	Name         string   `json:"name"`
	Destinations []string `json:"destinations"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Cover        string   `json:"cover"`
	ForceShrink  bool     `json:"force_shrink"`
}

// toEditTrip parses and validates the request into an EditTrip. It returns a
// client-safe error (rendered as 400) when a field is missing or invalid.
func (req editRequest) toEditTrip() (EditTrip, error) {
	dests, start, end, err := parseTripInput(req.Name, req.Destinations, req.StartDate, req.EndDate, req.Cover)
	if err != nil {
		return EditTrip{}, err
	}
	return EditTrip{
		Name:            req.Name,
		Destinations:    dests,
		StartDate:       start,
		EndDate:         end,
		Cover:           req.Cover,
		ForceRemoveDays: req.ForceShrink,
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
		var daysErr *ErrDaysHaveData
		if errors.As(err, &daysErr) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusConflict, "days_have_data",
				fmt.Sprintf("%d day(s) hold data; set force_shrink: true to confirm", daysErr.Count)))
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

// handleSetStatus is the shared handler body for archive and unarchive. fn is
// either store.Archive or store.Unarchive.
func (m *Module) handleSetStatus(
	w http.ResponseWriter, r *http.Request,
	fn func(ctx context.Context, id, ownerID string) (Trip, error),
	logAction string,
) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	id := r.PathValue("id")
	t, err := fn(r.Context(), id, p.UserID)
	if err != nil {
		if errors.Is(err, errTripNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "trip_not_found", "trip not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error(logAction, "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(newTripResponse(t))
}

// handleArchive sets a trip's status to archived. The trip is retained but
// excluded from active listings (Epic 03). Reversible via handleUnarchive.
func (m *Module) handleArchive(w http.ResponseWriter, r *http.Request) {
	m.handleSetStatus(w, r, m.store.Archive, "archiving trip")
}

// handleUnarchive restores an archived trip to active status.
func (m *Module) handleUnarchive(w http.ResponseWriter, r *http.Request) {
	m.handleSetStatus(w, r, m.store.Unarchive, "unarchiving trip")
}

// dayResponse is the wire shape returned for a single day.
type dayResponse struct {
	ID     string `json:"id"`
	TripID string `json:"trip_id"`
	Date   string `json:"date"`
	Index  int    `json:"index"`
	Notes  string `json:"notes"`
}

// handleGetDay returns a single day by trip + date. The route is
// GET /trips/{id}/days/{date} — trip id and date come from the path; ownerID
// from the session, so a day in another user's trip is a 404.
func (m *Module) handleGetDay(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	date := r.PathValue("date")

	// Reject malformed dates before hitting the DB: a cast error would surface
	// as a 500, and an unrecognisable date is semantically "no such day".
	if _, err := parseDate("date", date); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusNotFound, "day_not_found", "day not found"))
		return
	}

	day, err := m.store.GetDay(r.Context(), tripID, p.UserID, date)
	if err != nil {
		if errors.Is(err, errDayNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "day_not_found", "day not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("getting day", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(dayResponse{
		ID:     day.ID,
		TripID: day.TripID,
		Date:   day.Date.Format(dateLayout),
		Index:  day.Index,
		Notes:  day.Notes,
	})
}

// handleDelete removes a trip and its memberships in one transaction. Only the
// owner may delete (owner-scoped store). A missing or other-owner trip is an
// indistinguishable 404.
func (m *Module) handleDelete(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	id := r.PathValue("id")
	if err := m.store.Delete(r.Context(), id, p.UserID); err != nil {
		if errors.Is(err, errTripNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "trip_not_found", "trip not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("deleting trip", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
