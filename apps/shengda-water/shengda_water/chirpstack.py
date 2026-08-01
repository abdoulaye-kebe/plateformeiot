"""Client ChirpStack REST pour enqueue downlink."""

from __future__ import annotations

import os
from typing import Any

import httpx


class ChirpStackClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("CHIRPSTACK_REST_URL", "http://chirpstack-rest-api:8090").rstrip("/")
        self.api_token = os.getenv("CHIRPSTACK_API_TOKEN", "")

    def enqueue_downlink(
        self,
        dev_eui: str,
        payload_base64: str,
        f_port: int = 2,
        confirmed: bool = True,
    ) -> dict[str, Any]:
        body = {
            "queueItem": {
                "confirmed": confirmed,
                "data": payload_base64,
                "fPort": max(1, min(int(f_port), 255)),
            }
        }
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.api_token:
            headers["Grpc-Metadata-Authorization"] = f"Bearer {self.api_token}"

        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                f"{self.base_url}/api/devices/{dev_eui.lower()}/queue",
                json=body,
                headers=headers,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"chirpstack {resp.status_code}: {resp.text}")
            if not resp.content:
                return {"ok": True}
            return resp.json()
