"""Contexte tenant par requête (multi-tenant production)."""

from __future__ import annotations

import contextvars

chirpstack_tenant_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "chirpstack_tenant_id", default=""
)
