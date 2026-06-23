package trip

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// parseOptionalDate parses an optional YYYY-MM-DD string. Returns nil when
// value is empty, a client-safe error when value is present but malformed.
func parseOptionalDate(field, value string) (*time.Time, error) {
	if value == "" {
		return nil, nil
	}
	t, err := parseDate(field, value)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// createStayRequest is the create-stay wire shape. The optional "id" field
// carries a client-generated UUID for upsert idempotency (Epic 06 replay).
// location and link use *string so an absent field maps to nil (DB NULL) rather
// than an empty string, matching the nullable columns.
type createStayRequest struct {
	ClientID string   `json:"id"`
	Name     string   `json:"name"`
	Location *string  `json:"location"`
	CheckIn  string   `json:"check_in"`
	CheckOut string   `json:"check_out"`
	Cost     *float64 `json:"cost"`
	Link     *string  `json:"link"`
}

func (req createStayRequest) toNewStay(tripID string) (NewStay, error) {
	ci, err := parseOptionalDate("check_in", req.CheckIn)
	if err != nil {
		return NewStay{}, err
	}
	co, err := parseOptionalDate("check_out", req.CheckOut)
	if err != nil {
		return NewStay{}, err
	}
	if err := validateStayFields(req.Name, req.Location, ci, co, req.Link); err != nil {
		return NewStay{}, err
	}
	return NewStay{
		ClientID: req.ClientID,
		TripID:   tripID,
		Name:     req.Name,
		Location: req.Location,
		CheckIn:  ci,
		CheckOut: co,
		Cost:     req.Cost,
		Link:     req.Link,
	}, nil
}

// editStayRequest is the edit-stay wire shape.
type editStayRequest struct {
	Name     string   `json:"name"`
	Location *string  `json:"location"`
	CheckIn  string   `json:"check_in"`
	CheckOut string   `json:"check_out"`
	Cost     *float64 `json:"cost"`
	Link     *string  `json:"link"`
}

func (req editStayRequest) toEditStay() (EditStay, error) {
	ci, err := parseOptionalDate("check_in", req.CheckIn)
	if err != nil {
		return EditStay{}, err
	}
	co, err := parseOptionalDate("check_out", req.CheckOut)
	if err != nil {
		return EditStay{}, err
	}
	if err := validateStayFields(req.Name, req.Location, ci, co, req.Link); err != nil {
		return EditStay{}, err
	}
	return EditStay{
		Name:     req.Name,
		Location: req.Location,
		CheckIn:  ci,
		CheckOut: co,
		Cost:     req.Cost,
		Link:     req.Link,
	}, nil
}

// stayResponse is the stable wire shape returned for a single stay.
type stayResponse struct {
	ID       string   `json:"id"`
	TripID   string   `json:"trip_id"`
	Name     string   `json:"name"`
	Location *string  `json:"location,omitempty"`
	CheckIn  string   `json:"check_in,omitempty"`
	CheckOut string   `json:"check_out,omitempty"`
	Cost     *float64 `json:"cost,omitempty"`
	Link     *string  `json:"link,omitempty"`
}

func newStayResponse(s Stay) stayResponse {
	resp := stayResponse{
		ID:       s.ID,
		TripID:   s.TripID,
		Name:     s.Name,
		Location: s.Location,
		Cost:     s.Cost,
		Link:     s.Link,
	}
	if s.CheckIn != nil {
		resp.CheckIn = s.CheckIn.Format(dateLayout)
	}
	if s.CheckOut != nil {
		resp.CheckOut = s.CheckOut.Format(dateLayout)
	}
	return resp
}

// handleCreateStay creates a stay for the given trip (POST /trips/{id}/stays).
func (m *Module) handleCreateStay(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req createStayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	ns, err := req.toNewStay(tripID)
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_stay", err.Error()))
		return
	}

	st, err := m.stays.CreateStay(r.Context(), ns)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("creating stay", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(newStayResponse(st))
}

// handleUpdateStay edits a stay (PATCH /trips/{id}/stays/{stayID}).
func (m *Module) handleUpdateStay(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	stayID := r.PathValue("stayID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req editStayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	es, err := req.toEditStay()
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_stay", err.Error()))
		return
	}

	st, err := m.stays.UpdateStay(r.Context(), tripID, stayID, es)
	if err != nil {
		if errors.Is(err, errStayNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "stay_not_found", "stay not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("updating stay", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(newStayResponse(st))
}

// handleDeleteStay removes a stay (DELETE /trips/{id}/stays/{stayID}).
// Replaying a delete of a non-existent stay returns 204 — idempotent for
// Epic 06's offline replay.
func (m *Module) handleDeleteStay(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	stayID := r.PathValue("stayID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if err := m.stays.DeleteStay(r.Context(), tripID, stayID); err != nil {
		platformlog.FromContext(r.Context()).Error("deleting stay", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
