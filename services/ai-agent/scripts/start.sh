#!/bin/sh
set -e
python -m mcp_server.server &
MCP_PID=$!

# Attendre que le serveur MCP SSE soit prêt avant d'exposer l'API HTTP
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${MCP_PORT:-8095}/sse" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

trap 'kill "$MCP_PID" 2>/dev/null || true' EXIT
exec uvicorn mcp_client.http_api:app --host 0.0.0.0 --port "${AGENT_HTTP_PORT:-8096}"
