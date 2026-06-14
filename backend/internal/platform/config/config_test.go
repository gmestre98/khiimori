package config

import (
	"os"
	"testing"
)

// clearEnv unsets every variable Load reads so a test starts from a known state.
// t.Setenv snapshots the original value and restores it when the test ends; the
// following os.Unsetenv then clears it so LookupEnv reports the variable absent.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{"PORT", "ENV", "LOG_LEVEL", "DATABASE_URL", "DATABASE_URL_DIRECT", "DB_POOLED", "CORS_ALLOWED_ORIGINS", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET", "OAUTH_REDIRECT_URI", "ADMIN_EMAIL"} {
		t.Setenv(k, "")
		if err := os.Unsetenv(k); err != nil {
			t.Fatalf("unset %s: %v", k, err)
		}
	}
}

// setAllValid sets every variable Load requires to a valid value (pooled mode),
// so a test exercising one field isn't tripped by another's mandatory check.
func setAllValid(t *testing.T) {
	t.Helper()
	t.Setenv("PORT", "8080")
	t.Setenv("ENV", "dev")
	t.Setenv("LOG_LEVEL", "error")
	t.Setenv("DB_POOLED", "true")
	t.Setenv("DATABASE_URL", "postgres://localhost/khiimori")
	t.Setenv("DATABASE_URL_DIRECT", "postgres://localhost:5433/khiimori")
}

func TestLoadValid(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9090")
	t.Setenv("ENV", "prod")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("DB_POOLED", "false")
	t.Setenv("DATABASE_URL", "postgres://localhost/khiimori")
	t.Setenv("DATABASE_URL_DIRECT", "postgres://localhost:5433/khiimori")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}
	if cfg.Port != 9090 {
		t.Errorf("Port = %d, want 9090", cfg.Port)
	}
	if cfg.Env != EnvProd {
		t.Errorf("Env = %q, want %q", cfg.Env, EnvProd)
	}
	if cfg.LogLevel != LevelInfo {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, LevelInfo)
	}
	if cfg.DBPooled {
		t.Error("DBPooled = true, want false")
	}
	if cfg.DatabaseURL != "postgres://localhost/khiimori" {
		t.Errorf("DatabaseURL = %q, unexpected", cfg.DatabaseURL)
	}
	if cfg.DatabaseURLDirect != "postgres://localhost:5433/khiimori" {
		t.Errorf("DatabaseURLDirect = %q, unexpected", cfg.DatabaseURLDirect)
	}
}

// TestLoadCORSAllowedOrigins covers the optional cross-origin allowlist: a
// comma-separated value is split and trimmed, and an unset value yields none.
func TestLoadCORSAllowedOrigins(t *testing.T) {
	t.Run("parses and trims a comma-separated list", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)
		// Includes surrounding whitespace, a trailing slash, and a blank entry —
		// all normalised away so the value matches the browser's bare Origin.
		t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173, https://khiimori-web.web.app/ ,")

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		want := []string{"http://localhost:5173", "https://khiimori-web.web.app"}
		if len(cfg.CORSAllowedOrigins) != len(want) {
			t.Fatalf("CORSAllowedOrigins = %v, want %v", cfg.CORSAllowedOrigins, want)
		}
		for i, o := range want {
			if cfg.CORSAllowedOrigins[i] != o {
				t.Errorf("CORSAllowedOrigins[%d] = %q, want %q", i, cfg.CORSAllowedOrigins[i], o)
			}
		}
	})

	t.Run("unset yields no allowed origins", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		if len(cfg.CORSAllowedOrigins) != 0 {
			t.Errorf("CORSAllowedOrigins = %v, want empty", cfg.CORSAllowedOrigins)
		}
	})
}

// TestLoadOAuthFields covers the M02.1 OAuth settings: they are read from the
// environment when present and stay empty (no error) when unset — optional at
// startup, since non-auth work runs without them and the sign-in endpoints
// validate at call time.
func TestLoadOAuthFields(t *testing.T) {
	t.Run("read when set", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)
		t.Setenv("OAUTH_CLIENT_ID", "cid.apps.googleusercontent.com")
		t.Setenv("OAUTH_CLIENT_SECRET", "the-secret")
		t.Setenv("OAUTH_REDIRECT_URI", "https://app.example/auth/callback")

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		if cfg.OAuthClientID != "cid.apps.googleusercontent.com" {
			t.Errorf("OAuthClientID = %q, unexpected", cfg.OAuthClientID)
		}
		if cfg.OAuthClientSecret != "the-secret" {
			t.Errorf("OAuthClientSecret = %q, unexpected", cfg.OAuthClientSecret)
		}
		if cfg.OAuthRedirectURI != "https://app.example/auth/callback" {
			t.Errorf("OAuthRedirectURI = %q, unexpected", cfg.OAuthRedirectURI)
		}
	})

	t.Run("optional when unset", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		if cfg.OAuthClientID != "" || cfg.OAuthClientSecret != "" || cfg.OAuthRedirectURI != "" {
			t.Errorf("expected empty OAuth fields when unset, got %+v", cfg)
		}
	})
}

// TestLoadAdminEmail covers the optional admin-bootstrap email (S4): a set value
// is read and trimmed; an unset value yields empty (no user bootstrapped).
func TestLoadAdminEmail(t *testing.T) {
	t.Run("read and trimmed when set", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)
		t.Setenv("ADMIN_EMAIL", "  Owner@example.com  ")

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		if cfg.AdminEmail != "Owner@example.com" {
			t.Errorf("AdminEmail = %q, want %q (trimmed, case preserved)", cfg.AdminEmail, "Owner@example.com")
		}
	})

	t.Run("optional when unset", func(t *testing.T) {
		clearEnv(t)
		setAllValid(t)

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() returned error: %v", err)
		}
		if cfg.AdminEmail != "" {
			t.Errorf("AdminEmail = %q, want empty when unset", cfg.AdminEmail)
		}
	})
}

// TestLoadRequired asserts that every mandatory variable must be set — omitting
// any one fails Load. (DATABASE_URL_DIRECT is optional in pooled mode, so it is
// covered separately in TestLoadActiveDSN.)
func TestLoadRequired(t *testing.T) {
	for _, omit := range []string{"PORT", "ENV", "LOG_LEVEL", "DB_POOLED", "DATABASE_URL"} {
		t.Run("missing "+omit, func(t *testing.T) {
			clearEnv(t)
			setAllValid(t)
			if err := os.Unsetenv(omit); err != nil {
				t.Fatalf("unset %s: %v", omit, err)
			}
			if _, err := Load(); err == nil {
				t.Fatalf("Load() without %s returned nil error, want error", omit)
			}
		})
	}
}

func TestLoadInvalid(t *testing.T) {
	tests := []struct {
		name string
		key  string
		val  string
	}{
		{"non-numeric port", "PORT", "not-a-number"},
		{"port out of range", "PORT", "70000"},
		{"unknown env", "ENV", "staging"},
		{"unknown log level", "LOG_LEVEL", "verbose"},
		{"non-bool DB_POOLED", "DB_POOLED", "yes"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			setAllValid(t) // isolate the failure to the field under test
			t.Setenv(tc.key, tc.val)

			if _, err := Load(); err == nil {
				t.Fatalf("Load() with %s=%q returned nil error, want error", tc.key, tc.val)
			}
		})
	}
}

// TestLoadActiveDSN asserts the active database DSN (per the DB_POOLED toggle) is
// mandatory, while the unused endpoint stays optional.
func TestLoadActiveDSN(t *testing.T) {
	tests := []struct {
		name      string
		pooled    string
		url       string
		urlDirect string
		wantErr   bool
	}{
		{name: "pooled, no DATABASE_URL", pooled: "true", urlDirect: "postgres://d", wantErr: true},
		{name: "pooled, only DATABASE_URL", pooled: "true", url: "postgres://p", wantErr: false},
		{name: "direct, no DATABASE_URL_DIRECT", pooled: "false", url: "postgres://p", wantErr: true},
		{name: "direct, only DATABASE_URL_DIRECT", pooled: "false", urlDirect: "postgres://d", wantErr: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("PORT", "8080")
			t.Setenv("ENV", "dev")
			t.Setenv("LOG_LEVEL", "error")
			t.Setenv("DB_POOLED", tc.pooled)
			if tc.url != "" {
				t.Setenv("DATABASE_URL", tc.url)
			}
			if tc.urlDirect != "" {
				t.Setenv("DATABASE_URL_DIRECT", tc.urlDirect)
			}

			_, err := Load()
			if tc.wantErr && err == nil {
				t.Fatal("Load() returned nil error, want error for missing active DSN")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("Load() returned error %v, want success", err)
			}
		})
	}
}
