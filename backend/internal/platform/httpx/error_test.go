package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func decodeError(t *testing.T, body []byte) errorDetail {
	t.Helper()
	var got errorBody
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, body)
	}
	return got.Error
}

func TestWriteErrorTypedAPIError(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/trips/123", nil)

	WriteError(rec, req, NewAPIError(http.StatusNotFound, "not_found", "trip not found"))

	res := rec.Result()
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", res.StatusCode, http.StatusNotFound)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	detail := decodeError(t, rec.Body.Bytes())
	if detail.Code != "not_found" || detail.Message != "trip not found" {
		t.Errorf("body = %+v, want code=not_found message=\"trip not found\"", detail)
	}
}

func TestWriteErrorUnknownBecomesGeneric500(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	internal := errors.New("pq: password authentication failed for user admin")
	WriteError(rec, req, internal)

	res := rec.Result()
	if res.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", res.StatusCode)
	}
	detail := decodeError(t, rec.Body.Bytes())
	if detail.Code != genericErrorCode || detail.Message != genericErrorMessage {
		t.Errorf("body = %+v, want generic internal error", detail)
	}
	// The internal error string must never reach the client.
	if strings.Contains(rec.Body.String(), "password authentication") {
		t.Errorf("internal error leaked to client: %s", rec.Body.String())
	}
}

func TestWriteErrorIncludesRequestID(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(withRequestID(context.Background(), "req-abc"))

	WriteError(rec, req, NewAPIError(http.StatusBadRequest, "bad_request", "nope"))

	detail := decodeError(t, rec.Body.Bytes())
	if detail.RequestID != "req-abc" {
		t.Errorf("request_id = %q, want req-abc", detail.RequestID)
	}
}

func TestWriteErrorOmitsRequestIDWhenAbsent(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	WriteError(rec, req, NewAPIError(http.StatusBadRequest, "bad_request", "nope"))

	if strings.Contains(rec.Body.String(), "request_id") {
		t.Errorf("request_id should be omitted when absent: %s", rec.Body.String())
	}
}
