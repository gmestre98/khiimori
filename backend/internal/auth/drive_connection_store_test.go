package auth

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/oauth2"
)

// fakeBaseTS is a stub oauth2.TokenSource for the persistingTokenSource wrapper.
type fakeBaseTS struct {
	tok *oauth2.Token
	err error
}

func (f *fakeBaseTS) Token() (*oauth2.Token, error) { return f.tok, f.err }

func TestPersistingTokenSource_InvalidGrantMapsToDisconnected(t *testing.T) {
	p := &persistingTokenSource{base: &fakeBaseTS{err: &oauth2.RetrieveError{ErrorCode: "invalid_grant"}}}
	if _, err := p.Token(); !errors.Is(err, ErrDriveDisconnected) {
		t.Errorf("err = %v, want ErrDriveDisconnected", err)
	}
}

func TestPersistingTokenSource_OtherErrorPassesThrough(t *testing.T) {
	sentinel := errors.New("network down")
	p := &persistingTokenSource{base: &fakeBaseTS{err: sentinel}}
	if _, err := p.Token(); !errors.Is(err, sentinel) {
		t.Errorf("err = %v, want the underlying error", err)
	}
}

func TestPersistingTokenSource_NoRotationDoesNotTouchStore(t *testing.T) {
	// tok carries the same refresh token we already have (or none), so the wrapper
	// must not attempt a store write — proven here by leaving store nil: a write
	// attempt would nil-panic.
	cases := []*oauth2.Token{
		{AccessToken: "at", RefreshToken: "rt-current"}, // unchanged
		{AccessToken: "at"},                             // refresh omitted (common on refresh)
	}
	for _, tok := range cases {
		p := &persistingTokenSource{base: &fakeBaseTS{tok: tok}, lastRefresh: "rt-current"}
		got, err := p.Token()
		if err != nil {
			t.Fatalf("Token: %v", err)
		}
		if got.AccessToken != "at" {
			t.Errorf("access token = %q, want at", got.AccessToken)
		}
	}
}

func TestDriveStore_SaveRejectsMissingRefreshToken(t *testing.T) {
	// The guard returns before touching the pool, so a nil pool proves no write
	// is attempted. A crypter is present (Save encrypts before the pool call, but
	// only after the guard).
	c, _ := newDriveCrypter(testKeyB64(t))
	s := &driveConnectionStore{crypter: c} // pool intentionally nil
	for _, tok := range []*DriveToken{nil, {RefreshToken: ""}, {AccessToken: "at"}} {
		if err := s.Save(context.Background(), "user-1", tok); err == nil {
			t.Errorf("Save(%v) = nil, want error for missing refresh token", tok)
		}
	}
}

func TestIsInvalidGrant(t *testing.T) {
	if !isInvalidGrant(&oauth2.RetrieveError{ErrorCode: "invalid_grant"}) {
		t.Error("invalid_grant should be detected")
	}
	if isInvalidGrant(&oauth2.RetrieveError{ErrorCode: "temporarily_unavailable"}) {
		t.Error("a different oauth error is not invalid_grant")
	}
	if isInvalidGrant(errors.New("plain error")) {
		t.Error("a non-oauth error is not invalid_grant")
	}
}
