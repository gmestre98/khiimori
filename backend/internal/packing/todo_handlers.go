package packing

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// todoResponse is the wire shape for a single to-do. due_date is null when the
// to-do has no deadline.
type todoResponse struct {
	ID        string  `json:"id"`
	TripID    string  `json:"trip_id"`
	Title     string  `json:"title"`
	Note      string  `json:"note"`
	DueDate   *string `json:"due_date"`
	Done      bool    `json:"done"`
	Position  int     `json:"position"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

func todoToResponse(t Todo) todoResponse {
	var due *string
	if t.DueDate != "" {
		d := t.DueDate
		due = &d
	}
	return todoResponse{
		ID:        t.ID,
		TripID:    t.TripID,
		Title:     t.Title,
		Note:      t.Note,
		DueDate:   due,
		Done:      t.Done,
		Position:  t.Position,
		CreatedAt: t.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: t.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// createTodoRequest is the wire shape for adding a to-do. due_date may be
// omitted, null or "" for no deadline.
type createTodoRequest struct {
	Title   string  `json:"title"`
	Note    string  `json:"note"`
	DueDate *string `json:"due_date"`
}

// updateTodoRequest is the wire shape for a partial update. due_date is kept raw
// so an absent key (leave unchanged) is distinguishable from an explicit null
// (remove the deadline).
type updateTodoRequest struct {
	Title   *string         `json:"title"`
	Note    *string         `json:"note"`
	DueDate json.RawMessage `json:"due_date"`
	Done    *bool           `json:"done"`
}

// toUpdate converts the request into an UpdateTodo, decoding due_date.
func (req updateTodoRequest) toUpdate() (UpdateTodo, error) {
	in := UpdateTodo{Title: req.Title, Note: req.Note, Done: req.Done}
	if len(req.DueDate) > 0 {
		if bytes.Equal(bytes.TrimSpace(req.DueDate), []byte("null")) {
			in.ClearDueDate = true
		} else {
			var d string
			if err := json.Unmarshal(req.DueDate, &d); err != nil {
				return UpdateTodo{}, errors.New("packing: due_date must be a string or null")
			}
			in.DueDate = &d
		}
	}
	return in, nil
}

func internalError(w http.ResponseWriter, r *http.Request, msg string, err error) {
	platformlog.FromContext(r.Context()).Error(msg, "err", err.Error())
	httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
}

// handleListTodos handles GET /trips/{tripID}/todos.
func (m *Module) handleListTodos(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkReadAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	todos, err := m.store.ListTodos(r.Context(), tripID)
	if err != nil {
		internalError(w, r, "packing: list todos", err)
		return
	}
	resp := make([]todoResponse, len(todos))
	for i, t := range todos {
		resp[i] = todoToResponse(t)
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleCreateTodo handles POST /trips/{tripID}/todos.
func (m *Module) handleCreateTodo(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req createTodoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}
	in := CreateTodo{TripID: tripID, Title: req.Title, Note: req.Note}
	if req.DueDate != nil {
		in.DueDate = *req.DueDate
	}
	in.normalize()
	if err := in.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	t, err := m.store.CreateTodo(r.Context(), in)
	if err != nil {
		internalError(w, r, "packing: create todo", err)
		return
	}
	writeJSON(w, http.StatusCreated, todoToResponse(t))
}

// handleUpdateTodo handles PATCH /trips/{tripID}/todos/{todoID}.
func (m *Module) handleUpdateTodo(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	todoID := r.PathValue("todoID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req updateTodoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}
	in, err := req.toUpdate()
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}
	in.normalize()
	if err := in.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	t, err := m.store.UpdateTodo(r.Context(), tripID, todoID, in)
	if errors.Is(err, ErrTodoNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "todo_not_found", "to-do not found"))
		return
	}
	if err != nil {
		internalError(w, r, "packing: update todo", err)
		return
	}
	writeJSON(w, http.StatusOK, todoToResponse(t))
}

// handleDeleteTodo handles DELETE /trips/{tripID}/todos/{todoID}.
func (m *Module) handleDeleteTodo(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	todoID := r.PathValue("todoID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	err := m.store.DeleteTodo(r.Context(), tripID, todoID)
	if errors.Is(err, ErrTodoNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "todo_not_found", "to-do not found"))
		return
	}
	if err != nil {
		internalError(w, r, "packing: delete todo", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
