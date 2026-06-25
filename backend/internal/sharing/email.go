package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EmailSender sends a trip invitation email to the invitee.
// Callers depend on this interface; the concrete implementation can be swapped
// without changing the calling code (PRD §7.0).
type EmailSender interface {
	SendInvite(ctx context.Context, p InviteEmailParams) error
}

// InviteEmailParams are the inputs for a trip invitation email.
type InviteEmailParams struct {
	// ToEmail is the recipient's email address.
	ToEmail string
	// TripName is the human-readable trip title shown in the email body.
	TripName string
	// InviterName is the display name of the person who sent the invite.
	InviterName string
	// Role is the role being granted (editor or viewer).
	Role Role
	// AcceptURL is the full URL the invitee clicks to accept the invitation.
	AcceptURL string
}

// resendSender implements EmailSender using the Resend transactional email API
// (https://resend.com). It uses only stdlib net/http — no external SDK.
type resendSender struct {
	apiKey     string
	fromAddr   string
	httpClient *http.Client
}

const resendSendURL = "https://api.resend.com/emails"

// NewResendSender constructs a ResendEmailSender. apiKey must come from Secret
// Manager (never logged). fromAddr is the verified sender address configured in
// the Resend account (e.g. "Khiimori <noreply@mail.khiimori.app>").
func NewResendSender(apiKey, fromAddr string) EmailSender {
	return &resendSender{
		apiKey:   apiKey,
		fromAddr: fromAddr,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// resendPayload is the JSON body for POST /emails.
type resendPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// SendInvite sends a templated invitation email via Resend.
func (s *resendSender) SendInvite(ctx context.Context, p InviteEmailParams) error {
	if s.apiKey == "" {
		return errors.New("sharing: email sender: RESEND_API_KEY is not configured")
	}

	roleLabel := "viewer"
	if p.Role == RoleEditor {
		roleLabel = "editor"
	}

	subject := fmt.Sprintf("%s has invited you to \"%s\"", p.InviterName, p.TripName)
	html := fmt.Sprintf(`<p>Hi,</p>
<p><strong>%s</strong> has invited you to collaborate on the trip <strong>%s</strong> as a <strong>%s</strong>.</p>
<p><a href="%s">Accept invitation</a></p>
<p>If you did not expect this invitation, you can ignore this email.</p>`,
		p.InviterName, p.TripName, roleLabel, p.AcceptURL)

	payload := resendPayload{
		From:    s.fromAddr,
		To:      []string{p.ToEmail},
		Subject: subject,
		HTML:    html,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("sharing: email sender: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendSendURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("sharing: email sender: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sharing: email sender: send request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("sharing: email sender: Resend returned status %d", resp.StatusCode)
	}
	return nil
}

// NoopEmailSender is an EmailSender that discards all sends. Useful in tests.
type NoopEmailSender struct {
	// Sent accumulates params for every SendInvite call.
	Sent []InviteEmailParams
}

// SendInvite records p and returns nil.
func (n *NoopEmailSender) SendInvite(_ context.Context, p InviteEmailParams) error {
	n.Sent = append(n.Sent, p)
	return nil
}
