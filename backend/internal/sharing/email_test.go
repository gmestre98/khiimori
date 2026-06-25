package sharing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestNoopEmailSender verifies that the noop sender records calls and never errors.
func TestNoopEmailSender(t *testing.T) {
	t.Parallel()
	n := &NoopEmailSender{}
	p := InviteEmailParams{
		ToEmail:     "friend@example.com",
		TripName:    "Paris 2026",
		InviterName: "Alice",
		Role:        RoleEditor,
		AcceptURL:   "https://app.example.com/invite/accept?token=abc",
	}
	if err := n.SendInvite(context.Background(), p); err != nil {
		t.Fatalf("NoopEmailSender.SendInvite: %v", err)
	}
	if len(n.Sent) != 1 {
		t.Fatalf("want 1 sent, got %d", len(n.Sent))
	}
	if n.Sent[0].ToEmail != p.ToEmail {
		t.Errorf("want ToEmail %q, got %q", p.ToEmail, n.Sent[0].ToEmail)
	}
}

// TestResendSender_Success verifies a successful send via a fake HTTP server.
func TestResendSender_Success(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	sender := &resendSender{
		apiKey:     "test-key",
		fromAddr:   "noreply@example.com",
		httpClient: srv.Client(),
	}
	// Point to the fake server by swapping resendSendURL at test time is not
	// feasible without making it a field. Use a local wrapper instead.
	// We test via NewResendSender but override the URL with a monkey-patch-free
	// approach: directly construct resendSender with the test server URL.
	sender2 := &resendSender{
		apiKey:     "test-key",
		fromAddr:   "noreply@example.com",
		httpClient: srv.Client(),
	}
	_ = sender // suppress unused warning; both sender and sender2 are identical here

	// For the real test, we use sender2 with the actual request but route to srv.
	// Since resendSendURL is a package-level const we test the SendInvite method
	// directly via the httptest roundtrip by using a custom http.Client transport.
	sender2.httpClient = &http.Client{
		Transport: &rewriteTransport{base: http.DefaultTransport, target: srv.URL},
	}

	err := sender2.SendInvite(context.Background(), InviteEmailParams{
		ToEmail:     "friend@example.com",
		TripName:    "Tokyo 2027",
		InviterName: "Bob",
		Role:        RoleViewer,
		AcceptURL:   "https://app.example.com/invite/abc",
	})
	if err != nil {
		t.Fatalf("SendInvite: %v", err)
	}
}

// TestResendSender_NoAPIKey verifies that an unconfigured sender fails at call time.
func TestResendSender_NoAPIKey(t *testing.T) {
	t.Parallel()
	sender := &resendSender{apiKey: "", fromAddr: "noreply@example.com", httpClient: http.DefaultClient}
	err := sender.SendInvite(context.Background(), InviteEmailParams{})
	if err == nil {
		t.Fatal("expected error when apiKey is empty")
	}
}

// TestResendSender_NonSuccess verifies that a non-2xx response surfaces as an error.
func TestResendSender_NonSuccess(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	defer srv.Close()

	sender := &resendSender{
		apiKey:   "test-key",
		fromAddr: "noreply@example.com",
		httpClient: &http.Client{
			Transport: &rewriteTransport{base: http.DefaultTransport, target: srv.URL},
		},
	}
	err := sender.SendInvite(context.Background(), InviteEmailParams{
		ToEmail: "x@example.com",
		Role:    RoleViewer,
	})
	if err == nil {
		t.Fatal("expected error on non-2xx response")
	}
}

// rewriteTransport rewrites the host of every request to the target URL so
// tests can intercept outbound HTTP calls without changing package-level consts.
type rewriteTransport struct {
	base   http.RoundTripper
	target string // e.g. "http://127.0.0.1:PORT"
}

func (rt *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	// Replace scheme+host with the test server's address.
	clone.URL.Scheme = "http"
	clone.URL.Host = req.URL.Host // will be overridden below
	// Parse the target to get its host.
	target := rt.target
	if len(target) > 7 && target[:7] == "http://" {
		clone.URL.Host = target[7:]
	}
	return rt.base.RoundTrip(clone)
}
