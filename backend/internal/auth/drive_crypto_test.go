package auth

import (
	"crypto/rand"
	"encoding/base64"
	"io"
	"testing"
)

// testKeyB64 returns a random, valid 32-byte AES key, base64-encoded.
func testKeyB64(t *testing.T) string {
	t.Helper()
	k := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, k); err != nil {
		t.Fatalf("rand key: %v", err)
	}
	return base64.StdEncoding.EncodeToString(k)
}

func TestDriveCrypter_RoundTrip(t *testing.T) {
	c, err := newDriveCrypter(testKeyB64(t))
	if err != nil {
		t.Fatalf("newDriveCrypter: %v", err)
	}
	const secret = "1//refresh-token-value-abc123"
	blob, err := c.encrypt(secret)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if string(blob) == secret {
		t.Fatal("ciphertext equals plaintext — not encrypted")
	}
	got, err := c.decrypt(blob)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != secret {
		t.Errorf("decrypt = %q, want %q", got, secret)
	}
}

func TestDriveCrypter_DistinctNoncePerEncrypt(t *testing.T) {
	c, _ := newDriveCrypter(testKeyB64(t))
	a, _ := c.encrypt("same")
	b, _ := c.encrypt("same")
	if string(a) == string(b) {
		t.Error("two encryptions of the same plaintext produced identical ciphertext (nonce reuse)")
	}
}

func TestDriveCrypter_TamperedCiphertextRejected(t *testing.T) {
	c, _ := newDriveCrypter(testKeyB64(t))
	blob, _ := c.encrypt("secret")
	blob[len(blob)-1] ^= 0xFF // flip a bit in the auth tag / ciphertext
	if _, err := c.decrypt(blob); err == nil {
		t.Error("expected decrypt to fail on tampered ciphertext")
	}
}

func TestDriveCrypter_WrongKeyCannotDecrypt(t *testing.T) {
	c1, _ := newDriveCrypter(testKeyB64(t))
	c2, _ := newDriveCrypter(testKeyB64(t))
	blob, _ := c1.encrypt("secret")
	if _, err := c2.decrypt(blob); err == nil {
		t.Error("decrypt under a different key should fail")
	}
}

func TestNewDriveCrypter_KeyValidation(t *testing.T) {
	if _, err := newDriveCrypter(""); err != ErrNoDriveKey {
		t.Errorf("empty key: err = %v, want ErrNoDriveKey", err)
	}
	if _, err := newDriveCrypter("not-base64!!!"); err == nil {
		t.Error("expected error for non-base64 key")
	}
	// A 16-byte key is valid AES but the store requires 32 (AES-256).
	short := base64.StdEncoding.EncodeToString(make([]byte, 16))
	if _, err := newDriveCrypter(short); err == nil {
		t.Error("expected error for a 16-byte key (must be 32)")
	}
}
