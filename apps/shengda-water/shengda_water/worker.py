"""Worker NATS + API REST application métier Shengda."""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from nats.aio.client import Client as NATS
from pydantic import BaseModel, Field

from shengda_water.chirpstack import ChirpStackClient
from shengda_water.protocol.decoder import decode_payload
from shengda_water.protocol.encoder import read_meter_info_command, valve_command
from shengda_water.store import ShengdaStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shengda-water")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable",
)
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
HTTP_PORT = int(os.getenv("SHENGDA_WATER_HTTP_PORT", "8098"))

store = ShengdaStore(DATABASE_URL)
chirpstack = ChirpStackClient()


def _parse_event_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def handle_uplink_event(event: dict[str, Any]) -> None:
    tenant_id = event.get("tenantId") or ""
    if not tenant_id:
        return

    device = event.get("device") or {}
    dev_eui = (device.get("devEui") or event.get("devEui") or "").lower()
    if not dev_eui:
        return

    payload = event.get("payload") or {}
    hex_payload = payload.get("hex") or event.get("data") or ""
    if not hex_payload:
        return

    try:
        reading = decode_payload(hex_payload)
    except Exception as exc:  # noqa: BLE001
        logger.debug("decode skip devEui=%s: %s", dev_eui, exc)
        return

    if reading.index_m3 is None and reading.status_word_1 is None and reading.battery_v is None:
        return

    application_id = device.get("applicationId") or event.get("applicationId")
    f_cnt = payload.get("fCnt") or event.get("fCnt")
    f_port = payload.get("fPort") or event.get("fPort")
    event_time = _parse_event_time(event.get("time"))

    store.upsert_meter_from_reading(tenant_id, dev_eui, application_id, reading)
    store.insert_reading(
        tenant_id,
        dev_eui,
        reading,
        f_cnt=f_cnt,
        f_port=f_port,
        event_time=event_time,
    )
    logger.info(
        "reading devEui=%s indexM3=%s valveOpen=%s batteryV=%s",
        dev_eui,
        reading.index_m3,
        reading.valve_open,
        reading.battery_v,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    nc = NATS()
    await nc.connect(NATS_URL)

    async def on_uplink(msg):
        try:
            event = json.loads(msg.data.decode())
            await handle_uplink_event(event)
        except Exception as exc:  # noqa: BLE001
            logger.warning("nats handler error: %s", exc)

    await nc.subscribe("platform.events.uplink", cb=on_uplink)
    logger.info("shengda-water subscribed platform.events.uplink")
    app.state.nats = nc
    yield
    await nc.drain()


app = FastAPI(title="Shengda Water Meter App", lifespan=lifespan)

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/")
async def ui() -> FileResponse:
    """Interface métier autonome (port 8098 — distinct de la console LoRaWAN sur 3000)."""
    return FileResponse(os.path.join(_STATIC_DIR, "index.html"))


class ValveCommandBody(BaseModel):
    action: str = Field(..., description="open | close | dredge | read")


class DecodeBody(BaseModel):
    hex: str


def _resolve_tenant_id(tenant_id: str | None, chirpstack_tenant_id: str | None) -> str:
    if tenant_id:
        return tenant_id
    if chirpstack_tenant_id:
        resolved = store.resolve_platform_tenant_by_chirpstack(chirpstack_tenant_id)
        if resolved:
            return resolved
        raise HTTPException(status_code=404, detail="platform tenant not found for chirpstackTenantId")
    raise HTTPException(status_code=422, detail="tenantId or chirpstackTenantId required")


@app.get("/codec")
async def get_codec() -> dict[str, Any]:
    codec_path = os.path.join(os.path.dirname(__file__), "..", "chirpstack", "shengda-v1.6.codec.js")
    with open(codec_path, encoding="utf-8") as f:
        script = f.read()
    return {
        "name": "Shengda Water Meter V1.6",
        "vendor": "Shengda",
        "payloadCodecRuntime": "JS",
        "downlinkFPort": 2,
        "script": script,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "shengda-water"}


@app.get("/meters")
async def list_meters(
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    meters = store.list_meters(tenant, limit)
    return {"result": meters, "totalCount": len(meters)}


@app.get("/meters/{dev_eui}")
async def get_meter(
    dev_eui: str,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    meter = store.get_meter(tenant, dev_eui)
    if not meter:
        raise HTTPException(status_code=404, detail="meter not found")
    return meter


@app.get("/meters/{dev_eui}/readings")
async def get_readings(
    dev_eui: str,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    readings = store.list_readings(tenant, dev_eui, limit)
    return {"result": readings, "totalCount": len(readings)}


@app.get("/meters/{dev_eui}/commands")
async def get_commands(
    dev_eui: str,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    commands = store.list_commands(tenant, dev_eui, limit)
    return {"result": commands, "totalCount": len(commands)}


@app.post("/meters/{dev_eui}/commands")
async def send_command(
    dev_eui: str,
    body: ValveCommandBody,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    action = body.action.lower().strip()
    if action == "read":
        cmd = read_meter_info_command()
        command_type = "read_meter"
    elif action in ("open", "close", "dredge", "dredge_schedule_on", "dredge_schedule_off"):
        cmd = valve_command(action)
        command_type = f"valve_{action}"
    else:
        raise HTTPException(status_code=400, detail="action must be open, close, dredge or read")

    cmd_id = store.insert_command(tenant, dev_eui, command_type, cmd["payloadHex"])

    try:
        result = chirpstack.enqueue_downlink(
            dev_eui,
            str(cmd["payloadBase64"]),
            f_port=int(cmd["fPort"]),
            confirmed=bool(cmd["confirmed"]),
        )
        store.update_command_status(cmd_id, "sent")
    except Exception as exc:  # noqa: BLE001
        store.update_command_status(cmd_id, "failed", str(exc))
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "id": str(cmd_id),
        "commandType": command_type,
        "payloadHex": cmd["payloadHex"],
        "chirpstack": result,
    }


@app.post("/decode")
async def decode(body: DecodeBody) -> dict[str, Any]:
    reading = decode_payload(body.hex)
    return reading.to_dict()


def main() -> None:
    uvicorn.run("shengda_water.worker:app", host="0.0.0.0", port=HTTP_PORT, log_level="info")


if __name__ == "__main__":
    main()
