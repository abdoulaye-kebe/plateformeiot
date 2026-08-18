"""Injecte le tenant ChirpStack depuis les en-têtes HTTP (multi-tenant)."""

from __future__ import annotations

from fastmcp.server.dependencies import get_http_headers
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext

from mcp_server.tenant_context import chirpstack_tenant_id

TENANT_HEADER = "x-chirpstack-tenant-id"


class TenantScopeMiddleware(Middleware):
    """Lie X-ChirpStack-Tenant-Id à la ContextVar pour chaque requête MCP."""

    async def on_request(self, context: MiddlewareContext, call_next: CallNext) -> object:
        headers = get_http_headers(include={TENANT_HEADER})
        tid = (headers.get(TENANT_HEADER) or "").strip()
        token = None
        if tid:
            token = chirpstack_tenant_id.set(tid)
        try:
            return await call_next(context)
        finally:
            if token is not None:
                chirpstack_tenant_id.reset(token)
