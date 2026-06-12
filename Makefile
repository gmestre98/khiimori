# Eudaimonia — developer commands.
# `make dev` brings up the backend + web app together for local development.

.DEFAULT_GOAL := help
.PHONY: help dev dev-backend dev-web install \
	migrate-up migrate-down migrate-reset migrate-status test-integration

# Load backend/.env if present (local dev); in CI / deploy the environment is
# already set, so migrations target whatever DATABASE_URL_DIRECT points at.
MIGRATE_ENV = cd backend && { [ -f .env ] && { set -a; . ./.env; set +a; } || true; }

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Start backend + web together (one-command local dev).
	@node scripts/dev.ts

dev-backend: ## Start only the Go backend (loads backend/.env).
	@cd backend && \
		if [ ! -f .env ]; then echo "✖ backend/.env missing — copy backend/.env.example and fill it in"; exit 1; fi; \
		set -a; . ./.env; set +a; \
		go run ./cmd/api

dev-web: ## Start only the Vite web app.
	@cd web && npm run dev

install: ## Install web dependencies (Go deps are fetched on build).
	@cd web && npm install

migrate-up: ## Apply all pending database migrations.
	@$(MIGRATE_ENV) && go run ./cmd/migrate up

migrate-down: ## Roll back the most recent migration.
	@$(MIGRATE_ENV) && go run ./cmd/migrate down

migrate-reset: ## Roll back all migrations.
	@$(MIGRATE_ENV) && go run ./cmd/migrate reset

migrate-status: ## Show applied / pending migrations.
	@$(MIGRATE_ENV) && go run ./cmd/migrate status

test-integration: ## Run DB integration tests (needs DATABASE_URL_TEST: a throwaway DB).
	@$(MIGRATE_ENV) && go test -tags=integration ./migrations/...
