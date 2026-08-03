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
from shengda_water.protocol.encoder import (
    read_meter_info_command,
    report_start_hour_command,
    timing_interval_command,
    valve_command,
)
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
    tenant_id = _resolve_event_tenant(event)
    if not tenant_id:
        dev_hint = (event.get("devEui") or (event.get("device") or {}).get("devEui") or "?").lower()
        logger.warning("uplink skip devEui=%s: tenantId introuvable", dev_hint)
        return

    device = event.get("device") or {}
    dev_eui = (device.get("devEui") or event.get("devEui") or "").lower()
    if not dev_eui:
        return

    payload = event.get("payload") or {}
    hex_payload = payload.get("hex") or event.get("data") or ""
    if not hex_payload:
        logger.debug("uplink skip devEui=%s: payload vide", dev_eui)
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


def _resolve_event_tenant(event: dict[str, Any]) -> str | None:
    tenant_id = (event.get("tenantId") or "").strip()
    if tenant_id:
        return tenant_id

    device = event.get("device") or {}
    application_id = device.get("applicationId") or event.get("applicationId")
    if application_id:
        resolved = store.resolve_tenant_by_application(str(application_id))
        if resolved:
            return resolved

    cs_tenant = device.get("tenantId") or event.get("chirpstackTenantId")
    if cs_tenant:
        resolved = store.resolve_platform_tenant_by_chirpstack(str(cs_tenant))
        if resolved:
            return resolved

    return None


async def handle_downlink_ack_event(event: dict[str, Any]) -> None:
    dev_eui = (event.get("devEui") or "").lower()
    if not dev_eui:
        return

    tenant_id = _resolve_event_tenant(event)
    payload_hex = event.get("payloadHex") or ""
    f_cnt_down = event.get("fCntDown")
    acknowledged = event.get("acknowledged", True)

    if not acknowledged:
        logger.warning("downlink nack devEui=%s fCntDown=%s", dev_eui, f_cnt_down)
        return

    if store.acknowledge_command(
        dev_eui,
        tenant_id=tenant_id,
        payload_hex=payload_hex or None,
        f_cnt_down=int(f_cnt_down) if f_cnt_down is not None else None,
    ):
        logger.info("downlink acknowledged devEui=%s fCntDown=%s", dev_eui, f_cnt_down)


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

    async def on_downlink_ack(msg):
        try:
            event = json.loads(msg.data.decode())
            await handle_downlink_ack_event(event)
        except Exception as exc:  # noqa: BLE001
            logger.warning("downlink ack handler error: %s", exc)

    await nc.subscribe("platform.events.uplink", cb=on_uplink)
    await nc.subscribe("platform.events.downlink.ack", cb=on_downlink_ack)
    logger.info("shengda-water subscribed platform.events.uplink + downlink.ack")
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


class MeterCommandBody(BaseModel):
    action: str = Field(
        ...,
        description=(
            "open | close | dredge | dredge_schedule_on | dredge_schedule_off | read | "
            "set_report_interval | set_report_hour"
        ),
    )
    interval_seconds: int | None = Field(None, ge=600, le=86400)
    report_hour: int | None = Field(None, ge=0, le=23)


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


def _valve_status(valve_open: bool | None) -> str:
    if valve_open is True:
        return "ouverte"
    if valve_open is False:
        return "fermée"
    return "inconnu"


def _has_telemetry_values(
    meter: dict[str, Any] | None,
    readings: list[dict[str, Any]],
    live: dict[str, Any] | None,
) -> bool:
    latest = readings[0] if readings else None
    return any(
        v is not None
        for v in (
            (meter or {}).get("last_index_m3"),
            (meter or {}).get("battery_v"),
            (meter or {}).get("valve_open"),
            (latest or {}).get("index_m3"),
            (latest or {}).get("battery_v"),
            (live or {}).get("indexM3"),
            (live or {}).get("batteryV"),
            (live or {}).get("valveOpen"),
        )
    )


def _build_meter_telemetry(
    tenant: str,
    dev_eui: str,
    readings_limit: int = 5,
) -> dict[str, Any]:
    dev_eui = dev_eui.lower()
    source = "shengda-store"
    meter = store.get_meter(tenant, dev_eui)
    readings = store.list_readings(tenant, dev_eui, readings_limit)
    live: dict[str, Any] | None = None

    if not _has_telemetry_values(meter, readings, live):
        archive = store.get_latest_payload_archive(tenant, dev_eui)
        if archive and archive.get("payload_hex"):
            try:
                decoded = decode_payload(str(archive["payload_hex"])).to_dict()
                event_time = archive.get("time")
                live = {
                    **decoded,
                    "eventTime": event_time.isoformat() if hasattr(event_time, "isoformat") else event_time,
                    "fCnt": archive.get("f_cnt"),
                    "fPort": archive.get("f_port"),
                }
                source = "payload-archive"
            except Exception as exc:  # noqa: BLE001
                logger.debug("archive decode skip devEui=%s: %s", dev_eui, exc)

    latest = readings[0] if readings else None
    valve_open = _first_value(
        (meter or {}).get("valve_open"),
        (latest or {}).get("valve_open"),
        (live or {}).get("valveOpen") if live else None,
    )
    out: dict[str, Any] = {
        "devEui": dev_eui,
        "name": (meter or {}).get("name") or dev_eui,
        "meterNumber": (meter or {}).get("meter_number"),
        "indexM3": _first_value(
            (meter or {}).get("last_index_m3"),
            (latest or {}).get("index_m3"),
            (live or {}).get("indexM3") if live else None,
        ),
        "indexLiters": _first_value(
            (meter or {}).get("last_index_liters"),
            (latest or {}).get("index_liters"),
            (live or {}).get("indexLiters") if live else None,
        ),
        "batteryV": _first_value(
            (meter or {}).get("battery_v"),
            (latest or {}).get("battery_v"),
            (live or {}).get("batteryV") if live else None,
        ),
        "valveOpen": valve_open,
        "valveStatus": _valve_status(valve_open),
        "valveFault": _first_value((meter or {}).get("valve_fault"), (live or {}).get("valveFault") if live else None),
        "batteryLow": _first_value((meter or {}).get("battery_low"), (live or {}).get("batteryLow") if live else None),
        "magneticAttack": _first_value(
            (meter or {}).get("magnetic_attack"),
            (live or {}).get("magneticAttack") if live else None,
        ),
        "lastReadingAt": _first_value(
            (meter or {}).get("last_reading_at"),
            (latest or {}).get("time"),
            (live or {}).get("eventTime") if live else None,
        ),
        "triggerLabel": (latest or {}).get("trigger_label") or ((live or {}).get("triggerLabel") if live else None),
        "recentReadings": readings[:5],
        "source": source,
    }
    return out


def _first_value(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _pick_best_meter_dev_eui(meters: list[dict[str, Any]]) -> str:
    for meter in meters:
        if meter.get("last_index_m3") is not None or meter.get("battery_v") is not None:
            dev_eui = (meter.get("dev_eui") or "").lower()
            if dev_eui:
                return dev_eui
    if meters:
        return (meters[0].get("dev_eui") or "").lower()
    return ""


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
    sync: bool = Query(True, description="Synchroniser depuis payload_archives si la liste est vide"),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    meters = store.list_meters(tenant, limit)
    synced = 0
    if sync and not meters:
        synced = store.sync_meters_from_archives(tenant, limit=min(limit, 200))
        if synced:
            logger.info("synced %s shengda meter(s) from payload_archives tenant=%s", synced, tenant)
            meters = store.list_meters(tenant, limit)
    return {"result": meters, "totalCount": len(meters), "syncedFromArchives": synced}


@app.post("/meters/sync")
async def sync_meters(
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    synced = store.sync_meters_from_archives(tenant, limit=limit)
    meters = store.list_meters(tenant, limit)
    return {"synced": synced, "totalCount": len(meters), "result": meters}


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


@app.get("/meters/latest/telemetry")
async def get_latest_meter_telemetry(
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    readingsLimit: int = Query(5, ge=1, le=20),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    meters = store.list_meters(tenant, 20)
    if meters:
        dev_eui = _pick_best_meter_dev_eui(meters)
        if dev_eui:
            out = _build_meter_telemetry(tenant, dev_eui, readings_limit=readingsLimit)
            out["autoSelected"] = True
            out["meterCount"] = len(meters)
            return out
    dev_eui = store.get_latest_dev_eui_with_payload(tenant)
    if dev_eui:
        out = _build_meter_telemetry(tenant, dev_eui, readings_limit=readingsLimit)
        out["autoSelected"] = True
        out["meterCount"] = 0
        return out
    raise HTTPException(status_code=404, detail="no meter found")


@app.get("/meters/{dev_eui}/telemetry")
async def get_meter_telemetry(
    dev_eui: str,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
    readingsLimit: int = Query(5, ge=1, le=20),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    return _build_meter_telemetry(tenant, dev_eui, readings_limit=readingsLimit)


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
    body: MeterCommandBody,
    tenantId: str | None = Query(None),
    chirpstackTenantId: str | None = Query(None),
) -> dict[str, Any]:
    tenant = _resolve_tenant_id(tenantId, chirpstackTenantId)
    action = body.action.lower().strip().replace("-", "_").replace(" ", "_")

    if action == "read":
        cmd = read_meter_info_command()
        command_type = "read_meter"
    elif action in ("open", "close", "dredge", "dredge_schedule_on", "dredge_schedule_off"):
        cmd = valve_command(action)
        command_type = f"valve_{action}"
    elif action in ("set_report_interval", "set_interval", "interval"):
        if body.interval_seconds is None:
            raise HTTPException(status_code=400, detail="interval_seconds required (600..86400)")
        cmd = timing_interval_command(body.interval_seconds)
        command_type = "set_report_interval"
    elif action in ("set_report_hour", "report_hour"):
        if body.report_hour is None:
            raise HTTPException(status_code=400, detail="report_hour required (0..23)")
        cmd = report_start_hour_command(body.report_hour)
        command_type = "set_report_hour"
    else:
        raise HTTPException(
            status_code=400,
            detail="action must be open, close, dredge, read, set_report_interval or set_report_hour",
        )

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
