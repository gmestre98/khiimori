package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

// driveCrypter encrypts and decrypts Drive refresh tokens for storage at rest
// (M13.1 S2). It uses AES-256-GCM (authenticated encryption) so a stored value
// is both confidential and tamper-evident. The key comes from Secret Manager via
// config; the plaintext refresh token never touches the database.
type driveCrypter struct {
	aead cipher.AEAD
}

// newDriveCrypter builds a crypter from a base64-encoded 32-byte key. An empty
// key returns ErrNoDriveKey so callers can treat the Drive integration as
// unconfigured; any other malformed key is a hard error (fail fast on a
// misconfigured secret rather than silently disabling encryption).
func newDriveCrypter(keyB64 string) (*driveCrypter, error) {
	keyB64 = strings.TrimSpace(keyB64)
	if keyB64 == "" {
		return nil, ErrNoDriveKey
	}
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return nil, fmt.Errorf("auth: drive token key is not valid base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("auth: drive token key must decode to 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("auth: drive token key: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("auth: drive token cipher: %w", err)
	}
	return &driveCrypter{aead: aead}, nil
}

// ErrNoDriveKey is returned by newDriveCrypter when no key is configured — a
// signal to leave the Drive integration unconfigured, not a fatal error.
var ErrNoDriveKey = errors.New("auth: no drive token key configured")

// encrypt seals plaintext and returns nonce||ciphertext. A fresh random nonce is
// generated per call (GCM must never reuse a nonce under the same key).
func (c *driveCrypter) encrypt(plaintext string) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("auth: drive token nonce: %w", err)
	}
	// Seal appends the ciphertext to nonce, so the result is nonce||ciphertext.
	return c.aead.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// decrypt reverses encrypt. A too-short or tampered blob returns an error (GCM
// authenticates the ciphertext).
func (c *driveCrypter) decrypt(blob []byte) (string, error) {
	ns := c.aead.NonceSize()
	if len(blob) < ns {
		return "", errors.New("auth: drive token ciphertext too short")
	}
	nonce, ct := blob[:ns], blob[ns:]
	pt, err := c.aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("auth: drive token decrypt failed: %w", err)
	}
	return string(pt), nil
}
