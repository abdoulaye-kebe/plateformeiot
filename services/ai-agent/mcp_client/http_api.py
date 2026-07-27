"""API HTTP pour le portail client — chat agent LoRaWAN."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mcp_client.agent import LoRaWANAgent
from mcp_server.tenant_context import chirpstack_tenant_id

app = FastAPI(title="Lorawan AI Agent API", version="0.1.0")

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


@app.middleware("http")
async def tenant_scope_middleware(request: Request, call_next):
    tenant = request.headers.get("X-ChirpStack-Tenant-Id", "").strip()
    token = chirpstack_tenant_id.set(tenant)
    try:
        return await call_next(request)
    finally:
        chirpstack_tenant_id.reset(token)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    answer: str
    provider: str
    form: str | None = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-agent-http"}


@app.get("/api/v1/tools")
async def list_tools() -> dict:
    tools = await get_agent().list_tools()
    return {"tools": tools}


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    agent = get_agent()
    answer = await agent.ask(req.message.strip())
    return ChatResponse(answer=answer, provider=agent.provider, form=agent._last_form)
