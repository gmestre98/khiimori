package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

// APIError is a typed error that is safe to render to clients. It carries an HTTP
// status, a stable machine-readable code, and a human-readable message. The
// message must never contain internal details (driver errors, stack traces, …).
type APIError struct {
	Status  int    // HTTP status code to send.
	Code    string // Stable, machine-readable error code (e.g. "not_found").
	Message string // Safe, human-readable message.
}

// NewAPIError builds an APIError.
func NewAPIError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

// Error implements the error interface.
func (e *APIError) Error() string {
	return e.Code + ": " + e.Message
}

// errorBody is the wire shape of an error response:
//
//	{"error":{"code":"...","message":"...","request_id":"..."}}
type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// Generic fallback for errors that are not a typed *APIError, so unmapped errors
// never leak internal details to the client.
const (
	genericErrorCode    = "internal_error"
	genericErrorMessage = "an internal error occurred"
)

// WriteError renders err as a JSON error response. A *APIError is rendered with
// its status, code, and message; any other error becomes a generic 500 without
// leaking internals — log the underlying error server-side separately. When a
// request id is present on r's context it is included so clients can quote it.
//
// r may be nil (e.g. from contexts without a request); the request id is then
// simply omitted.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	status := http.StatusInternalServerError
	detail := errorDetail{Code: genericErrorCode, Message: genericErrorMessage}

	var apiErr *APIError
	if errors.As(err, &apiErr) {
		status = apiErr.Status
		detail.Code = apiErr.Code
		detail.Message = apiErr.Message
	}

	if r != nil {
		if id := RequestID(r.Context()); id != "" {
			detail.RequestID = id
		}
	}

	w.Header().Set("Content-Type", "application/json")
	// Never let an error response be cached. This matters in front of Firebase
	// Hosting, whose CDN otherwise applies a default max-age to a rewrite response
	// that carries no Cache-Control and serves it to later requests: a cached 404
	// (e.g. a journal day with no entry yet) would then survive a subsequent write,
	// breaking read-after-write, and a cached 401 could be served to another
	// caller. Success responses already set no-store on their own writers.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorBody{Error: detail})
}
