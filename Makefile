# Common commands. CI runs `make check`, so passing it locally means CI's
# code checks should pass too.

# Load local overrides from .env (see .env.example) and pass them to commands.
-include .env
export

.PHONY: install dev dev-web dev-server db-up db-down db-migrate fmt check check-web check-server check-workflows

install:
	cd frontend && bun install --frozen-lockfile

# Runs the frontend and server together; Ctrl-C stops both.
dev:
	$(MAKE) -j2 dev-web dev-server

dev-web:
	cd frontend && bun run dev

dev-server:
	cd server && go run .

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

GOOSE_VERSION := v3.28.0

db-migrate:
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is not set; copy .env.example to .env"; exit 1)
	@# The connection string goes through the environment so make never echoes it.
	@cd server && GOOSE_DRIVER=postgres GOOSE_DBSTRING="$$DATABASE_URL" \
		go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir migrations up

fmt:
	cd frontend && bun run format
	cd server && gofmt -w .

check: check-web check-server check-workflows

check-web:
	cd frontend && bun run lint
	cd frontend && bun run typecheck
	cd frontend && bun run format:check
	cd frontend && bun run test
	cd frontend && bun run build

check-server:
	@cd server && unformatted="$$(gofmt -l .)" && \
		if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
	cd server && go mod tidy -diff
	cd server && go vet ./...
	cd server && go build ./...
	cd server && go test -race ./...

# Lints .github/workflows. The version is pinned so everyone gets the same rules.
ACTIONLINT_VERSION := v1.7.12

check-workflows:
	go run github.com/rhysd/actionlint/cmd/actionlint@$(ACTIONLINT_VERSION)
