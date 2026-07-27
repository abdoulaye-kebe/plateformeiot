.PHONY: up down logs setup-chirpstack platform-api ai-agent console bootstrap test-go

bootstrap:
	bash scripts/bootstrap.sh

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

setup-chirpstack:
	@if [ ! -f infra/chirpstack/docker-compose.yml ]; then \
		git clone --depth 1 https://github.com/chirpstack/chirpstack-docker.git infra/chirpstack; \
	fi

platform-api:
	cd services/platform-api && go run ./cmd/server

ai-agent-mcp:
	cd services/ai-agent && python -m mcp_server.server

ai-agent-cli:
	cd services/ai-agent && python -m mcp_client.cli

console-dev:
	cd apps/console && npm run dev

test-go:
	cd services/platform-api && go test ./...
	cd services/mqtt-ingestion && go test ./...
	cd services/rule-engine && go test ./...
	cd services/anomaly-worker && go test ./...

test-python:
	cd services/ai-agent && python -m pytest
