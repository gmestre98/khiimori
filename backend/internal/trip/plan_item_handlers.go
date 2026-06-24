package trip

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// createPlanItemRequest is the create-plan-item wire shape. Only title is
// required; all other fields are optional. The optional "id" field carries a
// client-generated UUID for upsert idempotency (Epic 06 replay). start_time,
// when present, makes the item timed; when absent the item is untimed. duration
// is only accepted when start_time is also set.
type createPlanItemRequest struct {
	ClientID      string   `json:"id"`
	DayID         *string  `json:"day_id"`
	Title         string   `json:"title"`
	Type          *string  `json:"type"`
	StartTime     *string  `json:"start_time"`
	Duration      *string  `json:"duration"`
	Location      *string  `json:"location"`
	BookingStatus *string  `json:"booking_status"`
	Cost          *float64 `json:"cost"`
	Link          *string  `json:"link"`
}

func (req createPlanItemRequest) toNewPlanItem(tripID string) (NewPlanItem, error) {
	if err := validatePlanItemFields(req.Title, req.Type, req.StartTime, req.Duration, req.Location, req.Link); err != nil {
		return NewPlanItem{}, err
	}
	return NewPlanItem{
		ClientID:      req.ClientID,
		TripID:        tripID,
		DayID:         req.DayID,
		Title:         req.Title,
		Type:          req.Type,
		StartTime:     req.StartTime,
		Duration:      req.Duration,
		Location:      req.Location,
		BookingStatus: req.BookingStatus,
		Cost:          req.Cost,
		Link:          req.Link,
	}, nil
}

// planItemResponse is the stable wire shape returned for a single plan item.
type planItemResponse struct {
	ID            string   `json:"id"`
	TripID        string   `json:"trip_id"`
	DayID         *string  `json:"day_id,omitempty"`
	Title         string   `json:"title"`
	Type          *string  `json:"type,omitempty"`
	StartTime     *string  `json:"start_time,omitempty"`
	Duration      *string  `json:"duration,omitempty"`
	Location      *string  `json:"location,omitempty"`
	BookingStatus *string  `json:"booking_status,omitempty"`
	Cost          *float64 `json:"cost,omitempty"`
	Link          *string  `json:"link,omitempty"`
	SortOrder     int      `json:"sort_order"`
	Status        string   `json:"status"`
}

func newPlanItemResponse(p PlanItem) planItemResponse {
	return planItemResponse(p)
}

// editPlanItemRequest is the edit-plan-item wire shape. Title is required;
// all other fields are optional and can be set to null to clear them.
// Setting start_time to null makes the item untimed; duration is also cleared
// automatically when start_time is absent (enforced by validation).
type editPlanItemRequest struct {
	Title         string   `json:"title"`
	Type          *string  `json:"type"`
	StartTime     *string  `json:"start_time"`
	Duration      *string  `json:"duration"`
	Location      *string  `json:"location"`
	BookingStatus *string  `json:"booking_status"`
	Cost          *float64 `json:"cost"`
	Link          *string  `json:"link"`
}

func (req editPlanItemRequest) toEditPlanItem() (EditPlanItem, error) {
	if err := validatePlanItemFields(req.Title, req.Type, req.StartTime, req.Duration, req.Location, req.Link); err != nil {
		return EditPlanItem{}, err
	}
	return EditPlanItem(req), nil
}

// backlogResponse is the wire shape for the backlog list endpoint.
type backlogResponse struct {
	Items []planItemResponse `json:"items"`
}

// handleListBacklog returns all plan items with day_id = null for a trip
// (GET /trips/{id}/plan-items/backlog), ordered by sort_order.
func (m *Module) handleListBacklog(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")

	if err := m.checkAccess(r.Context(), p.UserID, ActionRead, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	items, err := m.planItems.ListBacklog(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("listing backlog", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	resp := backlogResponse{Items: make([]planItemResponse, len(items))}
	for i, item := range items {
		resp.Items[i] = newPlanItemResponse(item)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}

// handleCreatePlanItem creates a plan item for the given trip
// (POST /trips/{id}/plan-items). Only title is required. When start_time is
// absent the item is untimed; when present it is timed (optional duration).
// day_id may be null (backlog) or a specific day id. The caller may supply an
// "id" for upsert idempotency (Epic 06).
func (m *Module) handleCreatePlanItem(w http.ResponseWriter, r *http.Request) {
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

	var req createPlanItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	ni, err := req.toNewPlanItem(tripID)
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_plan_item", err.Error()))
		return
	}

	item, err := m.planItems.CreatePlanItem(r.Context(), ni)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("creating plan item", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(newPlanItemResponse(item))
}

// handleUpdatePlanItem edits a plan item (PATCH /trips/{id}/plan-items/{itemID}).
// The request body replaces all editable fields; send null to clear an optional
// field (e.g. null start_time makes the item untimed).
func (m *Module) handleUpdatePlanItem(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	itemID := r.PathValue("itemID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req editPlanItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}

	ep, err := req.toEditPlanItem()
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_plan_item", err.Error()))
		return
	}

	item, err := m.planItems.UpdatePlanItem(r.Context(), tripID, itemID, ep)
	if err != nil {
		if errors.Is(err, errPlanItemNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "plan_item_not_found", "plan item not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("updating plan item", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(newPlanItemResponse(item))
}

// promotePlanItemRequest is the promote wire shape. day_id is required;
// start_time is optional (omit to keep the item untimed on the target day).
type promotePlanItemRequest struct {
	DayID     string  `json:"day_id"`
	StartTime *string `json:"start_time"`
}

// handlePromotePlanItem moves a backlog item to a specific day
// (POST /trips/{id}/plan-items/{itemID}/promote).
func (m *Module) handlePromotePlanItem(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	itemID := r.PathValue("itemID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req promotePlanItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}
	if req.DayID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_promote", "day_id is required"))
		return
	}
	if req.StartTime != nil {
		if _, _, err := parseTimeHHMM(*req.StartTime); err != nil {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusBadRequest, "invalid_promote", "start_time must be in HH:MM format"))
			return
		}
	}

	item, err := m.planItems.PromotePlanItem(r.Context(), tripID, itemID, PromotePlanItemInput(req))
	if err != nil {
		if errors.Is(err, errPlanItemNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "plan_item_not_found", "plan item not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("promoting plan item", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(newPlanItemResponse(item))
}

// handleDemotePlanItem moves a plan item back to the backlog
// (POST /trips/{id}/plan-items/{itemID}/demote).
func (m *Module) handleDemotePlanItem(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	itemID := r.PathValue("itemID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	item, err := m.planItems.DemotePlanItem(r.Context(), tripID, itemID)
	if err != nil {
		if errors.Is(err, errPlanItemNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "plan_item_not_found", "plan item not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("demoting plan item", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(newPlanItemResponse(item))
}

// reorderPlanItemsRequest is the reorder wire shape.
// item_ids is the desired sequence; sort_order 0, 1, 2, … is assigned
// by position. All IDs must belong to the given trip and day_id.
type reorderPlanItemsRequest struct {
	DayID   string   `json:"day_id"`
	ItemIDs []string `json:"item_ids"`
}

// handleReorderPlanItems sets sort_order for items within a day
// (POST /trips/{id}/plan-items/reorder). The caller sends the complete
// desired sequence in item_ids; sort_order is assigned 0, 1, 2, … by
// list position. The operation is idempotent — replaying with the same
// list produces the same sort_order values (PRD §6).
func (m *Module) handleReorderPlanItems(w http.ResponseWriter, r *http.Request) {
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

	var req reorderPlanItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_json", "request body is not valid JSON"))
		return
	}
	if req.DayID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_reorder", "day_id is required"))
		return
	}
	if len(req.ItemIDs) == 0 {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_reorder", "item_ids must not be empty"))
		return
	}

	items, err := m.planItems.ReorderPlanItems(r.Context(), tripID, req.DayID, req.ItemIDs)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("reordering plan items", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	resp := struct {
		Items []planItemResponse `json:"items"`
	}{Items: make([]planItemResponse, len(items))}
	for i, item := range items {
		resp.Items[i] = newPlanItemResponse(item)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}

// handleDeletePlanItem removes a plan item (DELETE /trips/{id}/plan-items/{itemID}).
// Replaying a delete of a non-existent item returns 204 — idempotent for
// Epic 06's offline replay.
func (m *Module) handleDeletePlanItem(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("id")
	itemID := r.PathValue("itemID")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if err := m.planItems.DeletePlanItem(r.Context(), tripID, itemID); err != nil {
		platformlog.FromContext(r.Context()).Error("deleting plan item", "err", err.Error())
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
