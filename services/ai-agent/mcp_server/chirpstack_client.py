"""Client HTTP ChirpStack REST API — partagé serveur/client MCP."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from mcp_server.tenant_context import chirpstack_tenant_id

DEFAULT_REST_URL = "http://localhost:8090"


class ChirpStackClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_token: str | None = None,
        tenant_id: str | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("CHIRPSTACK_REST_URL", DEFAULT_REST_URL)).rstrip("/")
        self.api_token = api_token or os.getenv("CHIRPSTACK_API_TOKEN", "")
        self._default_tenant_id = tenant_id or os.getenv("CHIRPSTACK_TENANT_ID", "")

    @property
    def tenant_id(self) -> str:
        ctx = chirpstack_tenant_id.get()
        return ctx or self._default_tenant_id

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.api_token:
            headers["Grpc-Metadata-Authorization"] = f"Bearer {self.api_token}"
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(),
                params=params or {},
                json=json_body,
            )
            if response.status_code == 204:
                return {"ok": True}
            if response.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"ChirpStack {response.status_code}: {response.text}",
                    request=response.request,
                    response=response,
                )
            if not response.content:
                return {"ok": True}
            return response.json()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._request("GET", path, params=params)

    async def _post(self, path: str, json_body: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", path, json_body=json_body)

    async def _put(self, path: str, json_body: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", path, json_body=json_body)

    async def _delete(self, path: str) -> dict[str, Any]:
        return await self._request("DELETE", path)

    @staticmethod
    def _time_range(hours: int) -> tuple[str, str]:
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z")

    async def list_applications(self, limit: int = 100) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if self.tenant_id:
            params["tenantId"] = self.tenant_id
        return await self._get("/api/applications", params)

    async def list_device_profiles(self, limit: int = 100) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if self.tenant_id:
            params["tenantId"] = self.tenant_id
        return await self._get("/api/device-profiles", params)

    async def resolve_default_application_id(self) -> str:
        env = os.getenv("CHIRPSTACK_DEFAULT_APPLICATION_ID", "").strip()
        if env:
            return env
        apps = await self.list_applications(limit=1)
        for item in apps.get("result", []):
            app = item.get("application", item)
            if app.get("id"):
                return str(app["id"])
        raise ValueError("Aucune application ChirpStack. Créez-en une dans l'UI.")

    async def resolve_default_device_profile_id(self) -> str:
        env = os.getenv("CHIRPSTACK_DEFAULT_DEVICE_PROFILE_ID", "").strip()
        if env:
            return env
        profiles = await self.list_device_profiles(limit=1)
        for item in profiles.get("result", []):
            profile = item.get("deviceProfile", item)
            if profile.get("id"):
                return str(profile["id"])
        raise ValueError(
            "Aucun device profile ChirpStack. Créez un profil Class A OTAA dans l'UI "
            "ou définissez CHIRPSTACK_DEFAULT_DEVICE_PROFILE_ID."
        )

    async def list_devices(self, limit: int = 50, application_id: str | None = None) -> dict[str, Any]:
        if application_id:
            return await self._get("/api/devices", {"limit": limit, "applicationId": application_id})

        if not self.tenant_id:
            return await self._get("/api/devices", {"limit": limit})

        apps = await self.list_applications(limit=100)
        app_items = apps.get("result", [])
        if not app_items:
            return {"totalCount": 0, "result": []}

        merged: list[Any] = []
        total_count = 0
        for item in app_items:
            application = item.get("application", item)
            app_id = application.get("id")
            if not app_id:
                continue
            devices = await self._get("/api/devices", {"limit": limit, "applicationId": app_id})
            total_count += int(devices.get("totalCount", 0))
            merged.extend(devices.get("result", []))
        return {"totalCount": total_count, "result": merged[:limit]}

    async def get_device(self, dev_eui: str) -> dict[str, Any]:
        return await self._get(f"/api/devices/{dev_eui.lower()}")

    async def create_device(
        self,
        dev_eui: str,
        name: str,
        application_id: str,
        device_profile_id: str,
        *,
        join_eui: str | None = None,
        description: str | None = None,
        tags: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        device: dict[str, Any] = {
            "devEui": dev_eui.lower(),
            "name": name,
            "applicationId": application_id,
            "deviceProfileId": device_profile_id,
        }
        if join_eui:
            device["joinEui"] = join_eui.lower()
        if description:
            device["description"] = description
        if tags:
            device["tags"] = tags
        return await self._post("/api/devices", {"device": device})

    async def create_device_keys(self, dev_eui: str, app_key: str, *, nwk_key: str = "") -> dict[str, Any]:
        keys: dict[str, Any] = {
            "devEui": dev_eui.lower(),
            "appKey": app_key.lower(),
        }
        if nwk_key:
            keys["nwkKey"] = nwk_key.lower()
        return await self._post(f"/api/devices/{dev_eui.lower()}/keys", {"deviceKeys": keys})

    async def update_device(
        self,
        dev_eui: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: dict[str, str] | None = None,
        is_disabled: bool | None = None,
        device_profile_id: str | None = None,
    ) -> dict[str, Any]:
        current = await self.get_device(dev_eui.lower())
        device = dict(current.get("device", current))
        if name is not None:
            device["name"] = name
        if description is not None:
            device["description"] = description
        if tags is not None:
            device["tags"] = tags
        if is_disabled is not None:
            device["isDisabled"] = is_disabled
        if device_profile_id is not None:
            device["deviceProfileId"] = device_profile_id
        allowed = {
            "applicationId",
            "description",
            "deviceProfileId",
            "isDisabled",
            "joinEui",
            "name",
            "skipFcntCheck",
            "tags",
            "variables",
        }
        payload = {k: v for k, v in device.items() if k in allowed}
        return await self._put(f"/api/devices/{dev_eui.lower()}", {"device": payload})

    async def delete_device(self, dev_eui: str) -> dict[str, Any]:
        return await self._delete(f"/api/devices/{dev_eui.lower()}")

    async def list_gateways(self, limit: int = 50) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if self.tenant_id:
            params["tenantId"] = self.tenant_id
        return await self._get("/api/gateways", params)

    async def get_gateway(self, gateway_id: str) -> dict[str, Any]:
        return await self._get(f"/api/gateways/{gateway_id.lower()}")

    async def create_gateway(
        self,
        gateway_id: str,
        name: str,
        *,
        description: str | None = None,
        tenant_id: str | None = None,
        tags: dict[str, str] | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> dict[str, Any]:
        gateway: dict[str, Any] = {
            "gatewayId": gateway_id.lower(),
            "name": name,
            "tenantId": tenant_id or self.tenant_id,
        }
        if description:
            gateway["description"] = description
        if tags:
            gateway["tags"] = tags
        if latitude is not None and longitude is not None:
            gateway["location"] = {
                "latitude": latitude,
                "longitude": longitude,
                "altitude": 0,
            }
        return await self._post("/api/gateways", {"gateway": gateway})

    async def update_gateway(
        self,
        gateway_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: dict[str, str] | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> dict[str, Any]:
        current = await self.get_gateway(gateway_id.lower())
        gateway = dict(current.get("gateway", current))
        if name is not None:
            gateway["name"] = name
        if description is not None:
            gateway["description"] = description
        if tags is not None:
            gateway["tags"] = tags
        if latitude is not None and longitude is not None:
            gateway["location"] = {
                "latitude": latitude,
                "longitude": longitude,
                "altitude": gateway.get("location", {}).get("altitude", 0),
            }
        allowed = {
            "description",
            "downlinkPriority",
            "location",
            "metadata",
            "name",
            "statsInterval",
            "tags",
            "tenantId",
        }
        payload = {k: v for k, v in gateway.items() if k in allowed}
        return await self._put(f"/api/gateways/{gateway_id.lower()}", {"gateway": payload})

    async def delete_gateway(self, gateway_id: str) -> dict[str, Any]:
        return await self._delete(f"/api/gateways/{gateway_id.lower()}")

    async def get_device_events(self, dev_eui: str, limit: int = 20) -> dict[str, Any]:
        return await self._get(f"/api/devices/{dev_eui.lower()}/events", {"limit": limit})

    async def get_device_metrics(self, dev_eui: str, hours: int = 24, aggregation: str = "HOUR") -> dict[str, Any]:
        start, end = self._time_range(hours)
        return await self._get(
            f"/api/devices/{dev_eui.lower()}/metrics",
            {"start": start, "end": end, "aggregation": aggregation},
        )

    async def get_device_link_metrics(self, dev_eui: str, hours: int = 24, aggregation: str = "HOUR") -> dict[str, Any]:
        start, end = self._time_range(hours)
        return await self._get(
            f"/api/devices/{dev_eui.lower()}/link-metrics",
            {"start": start, "end": end, "aggregation": aggregation},
        )

    async def get_gateway_metrics(self, gateway_id: str, hours: int = 24, aggregation: str = "HOUR") -> dict[str, Any]:
        start, end = self._time_range(hours)
        return await self._get(
            f"/api/gateways/{gateway_id.lower()}/metrics",
            {"start": start, "end": end, "aggregation": aggregation},
        )

    async def ping(self) -> None:
        await self.list_gateways(limit=1)
