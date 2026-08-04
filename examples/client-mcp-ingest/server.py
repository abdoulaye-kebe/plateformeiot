"""Serveur MCP minimal pour l'option B — réception des uplinks LoRaWAN.

La plateforme lorawan-platform appelle l'outil `ingest_lorawan_uplink` à chaque uplink
(config connecteur type=mcp dans /integrations).

Lancer :
  pip install fastmcp uvicorn
  python server.py

Endpoint SSE : http://0.0.0.0:3000/sse
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("client-mcp-ingest")

mcp = FastMCP(
    name="client-lorawan-ingest",
    instructions="Réception des uplinks LoRaWAN depuis la plateforme lorawan-platform.",
)


@mcp.tool()
async def ingest_lorawan_uplink(event: dict[str, Any], eventJson: str = "") -> dict[str, Any]:
    """Ingestion d'un uplink LoRaWAN poussé par la plateforme."""
    dev_eui = ""
    if isinstance(event.get("device"), dict):
        dev_eui = str(event["device"].get("devEui") or "")
    decoded = event.get("decoded") or {}
    logger.info(
        "uplink devEui=%s fPort=%s fCnt=%s gateway=%s decoded=%s",
        dev_eui,
        event.get("fPort"),
        event.get("fCnt"),
        event.get("gatewayId"),
        decoded,
    )
    # TODO: persister en base, publier sur une queue interne, etc.
    return {
        "accepted": True,
        "devEui": dev_eui,
        "tenantId": event.get("tenantId"),
        "event": event.get("event", "uplink"),
        "decoded": decoded,
    }


@mcp.tool()
async def health_check() -> dict[str, str]:
    """Test de connectivité depuis la plateforme."""
    return {"status": "ok", "service": "client-mcp-ingest"}


if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=3000)
