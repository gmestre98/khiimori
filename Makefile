# Eudaimonia — developer commands.
# `make dev` brings up the backend + web app together for local development.

.DEFAULT_GOAL := help
.PHONY: help dev dev-backend dev-web install

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
