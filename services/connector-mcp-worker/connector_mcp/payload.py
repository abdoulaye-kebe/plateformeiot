"""Construction payload uplink standard — données décodées ChirpStack (object)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any


def parse_decoded(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except json.JSONDecodeError:
            return {}
    return {}


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
        "fPort": event.get("fPort"),
        "fCnt": event.get("fCnt"),
        "gatewayId": event.get("gatewayId") or "",
        "decoded": parse_decoded(event.get("object")),
    }
