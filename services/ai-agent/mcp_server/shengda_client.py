"""Client HTTP application métier Shengda (compteurs d'eau)."""

from __future__ import annotations

import base64
import binascii
import os
from typing import Any

import httpx

from mcp_server.chirpstack_client import ChirpStackClient
from mcp_server.tenant_context import chirpstack_tenant_id


class ShengdaClient:
    def __init__(
        self,
        base_url: str | None = None,
        chirpstack: ChirpStackClient | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("SHENGDA_WATER_URL", "http://shengda-water:8098")).rstrip("/")
        self.chirpstack = chirpstack or ChirpStackClient()

    def _tenant_params(self) -> dict[str, str]:
        cs_tid = self.chirpstack.tenant_id or chirpstack_tenant_id.get() or os.getenv("CHIRPSTACK_TENANT_ID", "")
        if cs_tid:
            return {"chirpstackTenantId": cs_tid}
        platform_tid = os.getenv("PLATFORM_TENANT_ID", "").strip()
        if platform_tid:
            return {"tenantId": platform_tid}
        return {}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        merged = {**self._tenant_params(), **(params or {})}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self.base_url}{path}", params=merged)
            if resp.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Shengda {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )
            return resp.json()

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}{path}", json=body)
            if resp.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Shengda {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )
            return resp.json()

    async def list_meters(self, limit: int = 50) -> dict[str, Any]:
        return await self._get("/meters", {"limit": min(limit, 200)})

    async def get_meter(self, dev_eui: str) -> dict[str, Any]:
        return await self._get(f"/meters/{dev_eui.strip().lower()}")

    async def list_readings(self, dev_eui: str, limit: int = 10) -> dict[str, Any]:
        return await self._get(f"/meters/{dev_eui.strip().lower()}/readings", {"limit": min(limit, 50)})

    async def decode_payload(self, payload: str) -> dict[str, Any]:
        hex_payload = normalize_payload_to_hex(payload)
        return await self._post("/decode", {"hex": hex_payload})

    async def get_meter_telemetry(self, dev_eui: str, readings_limit: int = 5) -> dict[str, Any]:
        """Dernier relevé compteur : index m³, batterie, vanne, alarmes."""
        dev_eui = dev_eui.strip().lower()
        source = "shengda-store"
        meter: dict[str, Any] | None = None
        readings: list[dict[str, Any]] = []

        try:
            meter = await self.get_meter(dev_eui)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                raise

        try:
            readings_resp = await self.list_readings(dev_eui, limit=readings_limit)
            readings = readings_resp.get("result", [])
        except httpx.HTTPStatusError:
            readings = []

        live: dict[str, Any] | None = None
        if not meter and not readings:
            live = await self._decode_from_chirpstack_events(dev_eui)
            if live:
                source = "chirpstack-decode"

        device = await self._device_summary(dev_eui)
        telemetry = _build_telemetry(dev_eui, meter, readings, live, device)
        telemetry["source"] = source
        return telemetry

    async def find_low_battery_meters(self, limit: int = 100) -> dict[str, Any]:
        data = await self.list_meters(limit=limit)
        low: list[dict[str, Any]] = []
        for meter in data.get("result", []):
            if meter.get("battery_low") or (
                meter.get("battery_v") is not None and float(meter["battery_v"]) < 3.0
            ):
                low.append(meter)
        return {"totalScanned": len(data.get("result", [])), "lowBatteryMeters": low}

    async def _device_summary(self, dev_eui: str) -> dict[str, Any]:
        try:
            device = await self.chirpstack.get_device(dev_eui)
            body = device.get("device", device)
            return {
                "name": body.get("name"),
                "lastSeenAt": body.get("lastSeenAt"),
                "applicationId": body.get("applicationId"),
            }
        except Exception:  # noqa: BLE001
            return {}

    async def _decode_from_chirpstack_events(self, dev_eui: str) -> dict[str, Any] | None:
        try:
            events = await self.chirpstack.get_device_events(dev_eui, limit=20)
        except Exception:  # noqa: BLE001
            return None

        for item in events.get("result", []):
            event = item.get("event", item)
            if event.get("type") not in (None, "up"):
                continue
            payload = event.get("data") or event.get("objectJSON", {}).get("hex")
            if not payload:
                continue
            try:
                decoded = await self.decode_payload(str(payload))
            except Exception:  # noqa: BLE001
                continue
            if decoded.get("indexM3") is not None or decoded.get("batteryV") is not None:
                decoded["eventTime"] = event.get("time")
                decoded["fCnt"] = event.get("fCnt")
                decoded["fPort"] = event.get("fPort")
                return decoded
        return None


def normalize_payload_to_hex(payload: str) -> str:
    raw = payload.strip().replace(" ", "")
    if not raw:
        raise ValueError("payload vide")
    try:
        return bytes.fromhex(raw).hex()
    except ValueError:
        pass
    try:
        return binascii.hexlify(base64.b64decode(raw)).decode()
    except (binascii.Error, ValueError) as exc:
        raise ValueError("payload invalide (hex ou base64 attendu)") from exc


def _build_telemetry(
    dev_eui: str,
    meter: dict[str, Any] | None,
    readings: list[dict[str, Any]],
    live: dict[str, Any] | None,
    device: dict[str, Any],
) -> dict[str, Any]:
    latest = readings[0] if readings else None
    out: dict[str, Any] = {
        "devEui": dev_eui,
        "name": (meter or {}).get("name") or device.get("name"),
        "lastSeenAt": device.get("lastSeenAt"),
        "applicationId": (meter or {}).get("application_id") or device.get("applicationId"),
        "meterNumber": (meter or {}).get("meter_number"),
        "indexM3": _first(
            (meter or {}).get("last_index_m3"),
            (latest or {}).get("index_m3"),
            (live or {}).get("indexM3"),
        ),
        "indexLiters": _first(
            (meter or {}).get("last_index_liters"),
            (latest or {}).get("index_liters"),
            (live or {}).get("indexLiters"),
        ),
        "batteryV": _first((meter or {}).get("battery_v"), (latest or {}).get("battery_v"), (live or {}).get("batteryV")),
        "valveOpen": _first((meter or {}).get("valve_open"), (latest or {}).get("valve_open"), (live or {}).get("valveOpen")),
        "valveFault": _first((meter or {}).get("valve_fault"), (live or {}).get("valveFault")),
        "batteryLow": _first((meter or {}).get("battery_low"), (live or {}).get("batteryLow")),
        "magneticAttack": _first((meter or {}).get("magnetic_attack"), (live or {}).get("magneticAttack")),
        "lastReadingAt": (meter or {}).get("last_reading_at") or (latest or {}).get("time") or (live or {}).get("eventTime"),
        "triggerLabel": (latest or {}).get("trigger_label") or (live or {}).get("triggerLabel"),
        "recentReadings": readings[:5],
    }
    if out["valveOpen"] is True:
        out["valveStatus"] = "ouverte"
    elif out["valveOpen"] is False:
        out["valveStatus"] = "fermée"
    else:
        out["valveStatus"] = "inconnu"
    return out


def _first(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None
