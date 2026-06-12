package db

import (
	"context"
	"strings"
	"testing"

	"github.com/gmestre98/eudaimonia/backend/internal/platform/config"
)

// compile-time check: *DB satisfies the Pinger interface the readiness check
// (S6) depends on.
var _ Pinger = (*DB)(nil)

const (
	pooledDSN = "postgres://u:p@ep-x-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"
	directDSN = "postgres://u:p@ep-x.eu-west-2.aws.neon.tech/neondb?sslmode=require"
)

func TestSelectDSNToggle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		cfg  config.Config
		want string
	}{
		{
			name: "pooled picks DATABASE_URL",
			cfg:  config.Config{DBPooled: true, DatabaseURL: pooledDSN, DatabaseURLDirect: directDSN},
			want: pooledDSN,
		},
		{
			name: "direct picks DATABASE_URL_DIRECT",
			cfg:  config.Config{DBPooled: false, DatabaseURL: pooledDSN, DatabaseURLDirect: directDSN},
			want: directDSN,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := selectDSN(tc.cfg)
			if err != nil {
				t.Fatalf("selectDSN returned error: %v", err)
			}
			if got != tc.want {
				t.Errorf("selectDSN = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSelectDSNMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		cfg  config.Config
	}{
		{"pooled but DATABASE_URL empty", config.Config{DBPooled: true, DatabaseURLDirect: directDSN}},
		{"direct but DATABASE_URL_DIRECT empty", config.Config{DBPooled: false, DatabaseURL: pooledDSN}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, err := selectDSN(tc.cfg); err == nil {
				t.Fatal("selectDSN returned nil error, want error for empty DSN")
			}
		})
	}
}

func TestOpenEmptyDSN(t *testing.T) {
	t.Parallel()

	if _, err := Open(context.Background(), config.Config{DBPooled: true}); err == nil {
		t.Fatal("Open with empty DATABASE_URL returned nil error, want error")
	}
}

func TestOpenInvalidDSNHidesValue(t *testing.T) {
	t.Parallel()

	// A malformed DSN must error without connecting and without echoing the
	// (potentially secret-bearing) connection string back in the message.
	secret := "postgres://user:supersecret@:::not a dsn"
	_, err := Open(context.Background(), config.Config{DBPooled: true, DatabaseURL: secret})
	if err == nil {
		t.Fatal("Open with malformed DSN returned nil error, want error")
	}
	if strings.Contains(err.Error(), "supersecret") {
		t.Errorf("error message leaked the connection string: %v", err)
	}
}
