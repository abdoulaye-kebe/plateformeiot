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

    async def list_readings(self, dev_eui: str, limit: int = 10) -> dict[str, Any]:
        return await self._get(f"/meters/{dev_eui.strip().lower()}/readings", {"limit": min(limit, 50)})

    async def decode_payload(self, payload: str) -> dict[str, Any]:
        hex_payload = normalize_payload_to_hex(payload)
        return await self._post("/decode", {"hex": hex_payload})

    async def get_meter_telemetry(self, dev_eui: str, readings_limit: int = 5) -> dict[str, Any]:
        dev_eui = dev_eui.strip().lower()
        result = await self._get(
            f"/meters/{dev_eui}/telemetry",
            {"readingsLimit": min(readings_limit, 20)},
        )
        return await self._enrich_with_device(dev_eui, result)

    async def get_latest_meter_telemetry(self, readings_limit: int = 5) -> dict[str, Any]:
        try:
            result = await self._get("/meters/latest/telemetry", {"readingsLimit": min(readings_limit, 20)})
            dev_eui = (result.get("devEui") or "").lower()
            if dev_eui:
                return await self._enrich_with_device(dev_eui, result)
            return result
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                raise

        try:
            devices = (await self.chirpstack.list_devices(limit=20)).get("result", [])
        except Exception:  # noqa: BLE001
            devices = []

        if len(devices) == 1:
            dev_eui = (devices[0].get("device", devices[0]).get("devEui") or "").lower()
            result = await self.get_meter_telemetry(dev_eui, readings_limit=readings_limit)
            result["autoSelected"] = True
            result["deviceCount"] = 1
            return result

        if not devices:
            return {"error": "Aucun compteur ni device trouvé sur le réseau."}

        return {
            "error": "Plusieurs devices — précisez le DevEUI (16 hex).",
            "deviceCount": len(devices),
            "devices": [
                {
                    "devEui": item.get("device", item).get("devEui"),
                    "name": item.get("device", item).get("name"),
                }
                for item in devices[:10]
            ],
        }

    async def find_low_battery_meters(self, limit: int = 100) -> dict[str, Any]:
        data = await self.list_meters(limit=limit)
        low: list[dict[str, Any]] = []
        for meter in data.get("result", []):
            if meter.get("battery_low") or (
                meter.get("battery_v") is not None and float(meter["battery_v"]) < 3.0
            ):
                low.append(meter)
        return {"totalScanned": len(data.get("result", [])), "lowBatteryMeters": low}

    async def _enrich_with_device(self, dev_eui: str, result: dict[str, Any]) -> dict[str, Any]:
        try:
            device = await self.chirpstack.get_device(dev_eui)
            body = device.get("device", device)
            if body.get("name"):
                result["name"] = body["name"]
            result["lastSeenAt"] = body.get("lastSeenAt")
            result["applicationId"] = body.get("applicationId")
        except Exception:  # noqa: BLE001
            pass
        return result


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
