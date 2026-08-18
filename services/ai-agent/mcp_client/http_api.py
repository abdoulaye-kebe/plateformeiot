"""API HTTP pour le portail client — chat agent LoRaWAN."""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mcp_client.agent import LoRaWANAgent
from mcp_client.tenant_config import TenantAgentConfig
from mcp_server.tenant_context import chirpstack_tenant_id

app = FastAPI(title="Lorawan AI Agent API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_agent: LoRaWANAgent | None = None


def get_agent() -> LoRaWANAgent:
    global _agent
    if _agent is None:
        mcp_url = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8095/sse")
        _agent = LoRaWANAgent(mcp_url=mcp_url, fast=True)
    return _agent


def parse_tenant_config_header(raw: str | None) -> TenantAgentConfig | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return TenantAgentConfig.from_payload(data)
    except json.JSONDecodeError:
        return None


@app.middleware("http")
async def tenant_scope_middleware(request: Request, call_next):
    tenant = request.headers.get("X-ChirpStack-Tenant-Id", "").strip()
    token = chirpstack_tenant_id.set(tenant)
    try:
        return await call_next(request)
    finally:
        chirpstack_tenant_id.reset(token)


class TenantConfigPayload(BaseModel):
    displayName: str | None = None
    vertical: str | None = None
    systemPrompt: str | None = None
    welcomeMessage: str | None = None
    suggestions: list[str] = Field(default_factory=list)
    enabledBuiltinTools: list[str] = Field(default_factory=list)
    customTools: list[dict[str, Any]] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    tenantConfig: TenantConfigPayload | None = None


class ChatResponse(BaseModel):
    answer: str
    provider: str
    form: str | None = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-agent-http"}


@app.get("/api/v1/tools")
async def list_tools(request: Request) -> dict:
    cfg = None
    if request.headers.get("X-Tenant-Agent-Config"):
        cfg = parse_tenant_config_header(request.headers.get("X-Tenant-Agent-Config"))
    elif request.query_params.get("tenantConfig"):
        cfg = TenantAgentConfig.from_payload(json.loads(request.query_params["tenantConfig"]))
    tools = await get_agent().list_tools(cfg)
    return {"tools": tools}


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    agent = get_agent()
    cfg = None
    if req.tenantConfig:
        cfg = TenantAgentConfig.from_payload(req.tenantConfig.model_dump())
    elif request.headers.get("X-Tenant-Agent-Config"):
        cfg = parse_tenant_config_header(request.headers.get("X-Tenant-Agent-Config"))
    answer = await agent.ask(req.message.strip(), tenant_config=cfg)
    return ChatResponse(answer=answer, provider=agent.provider, form=agent._last_form)
