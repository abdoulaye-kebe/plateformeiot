"""Construction payload uplink standard (aligné connector-worker Go)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_uplink_payload(event: dict[str, Any]) -> dict[str, Any]:
    ts = event.get("time") or datetime.now(timezone.utc).isoformat()
    return {
        "event": "uplink",
        "tenantId": event.get("tenantId") or "",
        "time": ts,
        "device": {
            "devEui": event.get("devEui") or "",
            "applicationId": event.get("applicationId") or "",
        },
        "radio": {
            "rssi": event.get("rssi"),
            "snr": event.get("snr"),
            "dr": event.get("dr"),
        },
        "payload": {
            "fPort": event.get("fPort"),
            "fCnt": event.get("fCnt"),
            "hex": event.get("data") or "",
        },
        "gatewayId": event.get("gatewayId") or "",
    }
