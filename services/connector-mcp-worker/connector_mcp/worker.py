"""Connecteur MCP — forward uplinks vers serveurs MCP externes (SSE)."""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import psycopg
import uvicorn
from fastapi import FastAPI
from fastmcp import Client
from nats.aio.client import Client as NATS

from connector_mcp.payload import build_uplink_payload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("connector-mcp")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable",
)
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
HTTP_PORT = int(os.getenv("CONNECTOR_MCP_HTTP_PORT", "8097"))


def list_mcp_connectors(tenant_id: str, event: str = "uplink") -> list[dict[str, Any]]:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, config
                FROM tenant_connectors
                WHERE tenant_id = %s::uuid AND enabled = true AND type = 'mcp'
                  AND %s = ANY(events)
                """,
                (tenant_id, event),
            )
            rows = cur.fetchall()
    return [{"id": str(r[0]), "name": r[1], "config": r[2]} for r in rows]


async def dispatch_mcp(config: dict[str, Any], payload: dict[str, Any]) -> None:
    server_url = (config.get("serverUrl") or "").strip()
    tool_name = (config.get("toolName") or "ingest_lorawan_uplink").strip()
    if not server_url:
        raise ValueError("serverUrl required")

    event_json = json.dumps(payload, ensure_ascii=False)
    async with Client(server_url) as client:
        await client.call_tool(tool_name, {"event": payload, "eventJson": event_json})


async def dispatch_all(tenant_id: str, payload: dict[str, Any]) -> None:
    for conn in list_mcp_connectors(tenant_id):
        try:
            cfg = conn["config"]
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            await dispatch_mcp(cfg, payload)
            logger.info(
                "mcp ok connector=%s devEui=%s",
                conn["name"],
                payload.get("device", {}).get("devEui"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("mcp failed %s: %s", conn["name"], exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    nc = NATS()
    await nc.connect(NATS_URL)

    async def on_uplink(msg):
        try:
            event = json.loads(msg.data.decode())
            tenant_id = event.get("tenantId") or ""
            if not tenant_id:
                return
            payload = build_uplink_payload(event)
            await dispatch_all(tenant_id, payload)
        except Exception as exc:  # noqa: BLE001
            logger.warning("nats handler error: %s", exc)

    await nc.subscribe("platform.events.uplink", cb=on_uplink)
    logger.info("connector-mcp-worker subscribed platform.events.uplink")
    app.state.nats = nc
    yield
    await nc.drain()


app = FastAPI(title="Connector MCP Worker", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "connector-mcp-worker"}


@app.post("/test")
async def test_connector(body: dict[str, Any]) -> dict[str, Any]:
    config = body.get("config") or {}
    tenant_id = body.get("tenantId") or "00000000-0000-0000-0000-000000000001"
    payload = body.get("payload") or build_uplink_payload(
        {
            "tenantId": tenant_id,
            "devEui": "0102030405060708",
            "applicationId": "00000000-0000-0000-0000-000000000001",
            "gatewayId": "aabbccddeeff0011",
            "rssi": -85,
            "snr": 9.5,
            "dr": 5,
            "fPort": 1,
            "fCnt": 42,
            "data": "0102ab",
            "time": "2026-01-01T00:00:00Z",
        }
    )
    try:
        await dispatch_mcp(config, payload)
        tool = config.get("toolName") or "ingest_lorawan_uplink"
        return {"success": True, "detail": f"tool {tool} invoked on {config.get('serverUrl')}"}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "detail": str(exc)}


def main() -> None:
    uvicorn.run("connector_mcp.worker:app", host="0.0.0.0", port=HTTP_PORT, log_level="info")


if __name__ == "__main__":
    main()
