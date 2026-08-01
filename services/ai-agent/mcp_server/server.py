"""Serveur MCP LoRaWAN — outils lecture, écriture et métriques ChirpStack."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

from mcp_server.chirpstack_client import ChirpStackClient
from mcp_server.radio import parse_radio_from_events, summarize_link_metrics
from mcp_server.shengda_client import ShengdaClient
from mcp_server.tenant_context import chirpstack_tenant_id

mcp = FastMCP(
    name="lorawan-platform",
    instructions=(
        "Serveur MCP pour la plateforme IoT LoRaWAN (ChirpStack). "
        "Outils de lecture, écriture (CRUD), métriques radio (RSSI, SNR, SF/DR), diagnostics "
        "et télémétrie compteurs d'eau Shengda (index m³, batterie, vanne). "
        "Pour delete_gateway et delete_device, confirm=true est obligatoire."
    ),
)

cs = ChirpStackClient()
shengda = ShengdaClient(chirpstack=cs)


def _parse_last_seen(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return None


# ── Lecture ──────────────────────────────────────────────────────────────────


@mcp.tool()
async def list_applications(limit: int = 50) -> dict[str, Any]:
    """Liste les applications LoRaWAN du tenant."""
    return await cs.list_applications(limit=min(limit, 100))


@mcp.tool()
async def list_devices(limit: int = 50, application_id: str = "") -> dict[str, Any]:
    """Liste les devices LoRaWAN (optionnel: filtrer par application_id)."""
    return await cs.list_devices(limit=min(limit, 100), application_id=application_id or None)


@mcp.tool()
async def get_device(dev_eui: str) -> dict[str, Any]:
    """Récupère le détail d'un device par DevEUI."""
    return await cs.get_device(dev_eui.strip().lower())


@mcp.tool()
async def list_gateways(limit: int = 50) -> dict[str, Any]:
    """Liste les gateways LoRaWAN du tenant."""
    return await cs.list_gateways(limit=min(limit, 100))


@mcp.tool()
async def get_gateway(gateway_id: str) -> dict[str, Any]:
    """Récupère le détail d'une gateway par Gateway ID (EUI64)."""
    return await cs.get_gateway(gateway_id.strip().lower())


@mcp.tool()
async def get_device_events(dev_eui: str, limit: int = 20) -> dict[str, Any]:
    """Récupère les derniers événements (uplink/downlink/join/status) d'un device."""
    return await cs.get_device_events(dev_eui.strip().lower(), limit=min(limit, 50))


# ── Écriture — Gateways ──────────────────────────────────────────────────────


@mcp.tool()
async def create_gateway(
    gateway_id: str,
    name: str,
    description: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
    tags_json: str = "",
) -> dict[str, Any]:
    """Crée une gateway LoRaWAN. gateway_id = EUI64 (16 hex). tags_json optionnel: {"site":"paris"}."""
    tags = _parse_tags(tags_json) if tags_json.strip() else None
    result = await cs.create_gateway(
        gateway_id.strip().lower(),
        name,
        description=description or None,
        latitude=latitude,
        longitude=longitude,
        tags=tags,
    )
    if result == {} or result.get("ok"):
        return {"ok": True, "gatewayId": gateway_id.lower(), "name": name, "message": "Gateway créée avec succès"}
    return result


@mcp.tool()
async def update_gateway(
    gateway_id: str,
    name: str = "",
    description: str = "",
    tags_json: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict[str, Any]:
    """Modifie une gateway (nom, description, tags, GPS)."""
    tags = _parse_tags(tags_json) if tags_json else None
    return await cs.update_gateway(
        gateway_id.strip().lower(),
        name=name or None,
        description=description or None,
        tags=tags,
        latitude=latitude,
        longitude=longitude,
    )


@mcp.tool()
async def delete_gateway(gateway_id: str, confirm: bool = False) -> dict[str, Any]:
    """Supprime une gateway. confirm=true obligatoire."""
    if not confirm:
        return {"error": "Opération destructive — repassez confirm=true pour supprimer."}
    return await cs.delete_gateway(gateway_id.strip().lower())


# ── Écriture — Devices ─────────────────────────────────────────────────────


@mcp.tool()
async def list_device_profiles(limit: int = 50) -> dict[str, Any]:
    """Liste les profils device LoRaWAN du tenant (Class A/B/C, OTAA/ABP)."""
    return await cs.list_device_profiles(limit=min(limit, 100))


@mcp.tool()
async def create_device(
    dev_eui: str,
    name: str = "",
    application_id: str = "",
    device_profile_id: str = "",
    join_eui: str = "",
    app_key: str = "",
    description: str = "",
    tags_json: str = "",
) -> dict[str, Any]:
    """Crée un device LoRaWAN OTAA/ABP. DevEUI obligatoire ; application/profile auto si vides. app_key pour OTAA."""
    dev = dev_eui.strip().lower()
    app_id = application_id.strip() or await cs.resolve_default_application_id()
    profile_id = device_profile_id.strip() or await cs.resolve_default_device_profile_id()
    device_name = name.strip() or f"device-{dev[-6:]}"
    tags = _parse_tags(tags_json) if tags_json.strip() else None
    try:
        result = await cs.create_device(
            dev,
            device_name,
            app_id,
            profile_id,
            join_eui=join_eui.lower() if join_eui else None,
            description=description or None,
            tags=tags,
        )
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
        if "duplicate" in err.lower() or "already exists" in err.lower():
            return {"ok": False, "devEui": dev, "error": f"Device {dev} existe déjà."}
        return {"ok": False, "devEui": dev, "error": err}

    keys_set = False
    if app_key.strip():
        try:
            await cs.create_device_keys(dev, app_key.strip())
            keys_set = True
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": True,
                "devEui": dev,
                "name": device_name,
                "applicationId": app_id,
                "deviceProfileId": profile_id,
                "joinEui": join_eui.lower() if join_eui else None,
                "keysConfigured": False,
                "warning": f"Device créé mais clés OTAA non configurées : {exc}",
            }

    if result == {} or result.get("ok"):
        return {
            "ok": True,
            "devEui": dev,
            "name": device_name,
            "applicationId": app_id,
            "deviceProfileId": profile_id,
            "joinEui": join_eui.lower() if join_eui else None,
            "keysConfigured": keys_set,
            "message": "Device créé avec succès",
        }
    return result


@mcp.tool()
async def update_device(
    dev_eui: str,
    name: str = "",
    description: str = "",
    tags_json: str = "",
    is_disabled: bool | None = None,
    device_profile_id: str = "",
) -> dict[str, Any]:
    """Modifie un device (nom, description, tags, activation/désactivation)."""
    tags = _parse_tags(tags_json) if tags_json else None
    return await cs.update_device(
        dev_eui.strip().lower(),
        name=name or None,
        description=description or None,
        tags=tags,
        is_disabled=is_disabled,
        device_profile_id=device_profile_id or None,
    )


@mcp.tool()
async def delete_device(dev_eui: str, confirm: bool = False) -> dict[str, Any]:
    """Supprime un device. confirm=true obligatoire."""
    if not confirm:
        return {"error": "Opération destructive — repassez confirm=true pour supprimer."}
    return await cs.delete_device(dev_eui.strip().lower())


# ── Métriques radio ──────────────────────────────────────────────────────────


@mcp.tool()
async def get_device_radio_info(dev_eui: str, limit: int = 10) -> dict[str, Any]:
    """RSSI, SNR, DR/SF des derniers uplinks d'un device (depuis les events)."""
    dev_eui = dev_eui.strip().lower()
    device = await cs.get_device(dev_eui)
    events = await cs.get_device_events(dev_eui, limit=min(limit, 30))
    radio = parse_radio_from_events(events, limit=limit)
    device_body = device.get("device", device)
    tags = device_body.get("tags") or {}
    return {
        "devEui": dev_eui,
        "name": device_body.get("name"),
        "lastSeenAt": device_body.get("lastSeenAt"),
        "batteryTag": tags.get("battery_pct") or tags.get("battery") or tags.get("batteryPercent"),
        "recentUplinks": radio,
        "summary": _radio_summary(radio),
    }


@mcp.tool()
async def get_device_link_metrics(dev_eui: str, hours: int = 24) -> dict[str, Any]:
    """Métriques link agrégées ChirpStack : RSSI, SNR, paquets reçus (gwRssi, gwSnr)."""
    metrics = await cs.get_device_link_metrics(dev_eui.strip().lower(), hours=min(hours, 168))
    return {"devEui": dev_eui, "hours": hours, "summary": summarize_link_metrics(metrics), "raw": metrics}


@mcp.tool()
async def get_device_metrics(dev_eui: str, hours: int = 24) -> dict[str, Any]:
    """Métriques device ChirpStack (états, compteurs)."""
    metrics = await cs.get_device_metrics(dev_eui.strip().lower(), hours=min(hours, 168))
    return {"devEui": dev_eui, "hours": hours, "metrics": metrics}


@mcp.tool()
async def get_gateway_metrics(gateway_id: str, hours: int = 24) -> dict[str, Any]:
    """Métriques gateway : paquets RX/TX, duty cycle."""
    metrics = await cs.get_gateway_metrics(gateway_id.strip().lower(), hours=min(hours, 168))
    return {"gatewayId": gateway_id, "hours": hours, "metrics": metrics}


# ── Diagnostics ──────────────────────────────────────────────────────────────


@mcp.tool()
async def diagnose_device(dev_eui: str) -> dict[str, Any]:
    """Diagnostique pourquoi un device ne communique plus."""
    dev_eui = dev_eui.strip().lower()
    device = await cs.get_device(dev_eui)
    events = await cs.get_device_events(dev_eui, limit=10)
    radio = parse_radio_from_events(events, limit=5)

    device_body = device.get("device", device)
    last_seen = _parse_last_seen(device_body.get("lastSeenAt"))
    now = datetime.now(timezone.utc)
    offline_minutes: float | None = None
    if last_seen:
        offline_minutes = (now - last_seen.astimezone(timezone.utc)).total_seconds() / 60

    recommendations: list[str] = []
    if last_seen is None:
        recommendations.append("Aucun uplink — vérifier provisioning OTAA/ABP et couverture.")
    elif offline_minutes and offline_minutes > 60:
        recommendations.append(f"Silencieux depuis {offline_minutes:.0f} min — batterie, gateway, ADR/SF.")
    if not events.get("result"):
        recommendations.append("Pas d'événements récents — frame counters et clés de session.")

    tags = device_body.get("tags") or {}
    return {
        "devEui": dev_eui,
        "device": device_body,
        "recentRadio": radio,
        "batteryTag": tags.get("battery_pct") or tags.get("battery"),
        "offlineMinutes": offline_minutes,
        "recommendations": recommendations,
        "status": "offline" if offline_minutes and offline_minutes > 30 else "degraded" if offline_minutes and offline_minutes > 5 else "online",
    }


@mcp.tool()
async def diagnose_gateway(gateway_id: str) -> dict[str, Any]:
    """Diagnostique pourquoi une gateway est offline."""
    gateway_id = gateway_id.strip().lower()
    gateway = await cs.get_gateway(gateway_id)
    body = gateway.get("gateway", gateway)
    last_seen = _parse_last_seen(body.get("lastSeenAt"))
    now = datetime.now(timezone.utc)
    offline_minutes: float | None = None
    if last_seen:
        offline_minutes = (now - last_seen.astimezone(timezone.utc)).total_seconds() / 60

    recommendations: list[str] = []
    if last_seen is None:
        recommendations.append("Jamais connectée — Basic Station / Packet Forwarder / MQTT.")
    elif offline_minutes and offline_minutes > 10:
        recommendations.append("Offline — alimentation, IP, certificats, firewall 1700/3001.")

    return {
        "gatewayId": gateway_id,
        "gateway": body,
        "offlineMinutes": offline_minutes,
        "recommendations": recommendations,
        "status": "offline" if offline_minutes and offline_minutes > 10 else "online",
    }


@mcp.tool()
async def find_low_battery_devices(limit: int = 100) -> dict[str, Any]:
    """Devices avec batterie faible (tags ChirpStack ou relevés compteurs Shengda)."""
    devices = await cs.list_devices(limit=min(limit, 200))
    low_battery: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in devices.get("result", []):
        device = item.get("device", item)
        dev_eui = (device.get("devEui") or "").lower()
        tags = device.get("tags") or {}
        battery = tags.get("battery") or tags.get("battery_pct") or tags.get("batteryPercent")
        if battery is not None:
            try:
                level = float(battery)
                if level < 20:
                    low_battery.append(
                        {
                            "devEui": dev_eui,
                            "name": device.get("name"),
                            "battery": level,
                            "source": "chirpstack-tag",
                            "lastSeenAt": device.get("lastSeenAt"),
                        }
                    )
                    seen.add(dev_eui)
            except (TypeError, ValueError):
                continue

    try:
        meters = await shengda.find_low_battery_meters(limit=limit)
        for meter in meters.get("lowBatteryMeters", []):
            dev_eui = (meter.get("dev_eui") or "").lower()
            if dev_eui in seen:
                continue
            low_battery.append(
                {
                    "devEui": dev_eui,
                    "name": meter.get("name"),
                    "batteryV": meter.get("battery_v"),
                    "batteryLow": meter.get("battery_low"),
                    "indexM3": meter.get("last_index_m3"),
                    "source": "shengda-meter",
                    "lastReadingAt": meter.get("last_reading_at"),
                }
            )
            seen.add(dev_eui)
    except Exception:  # noqa: BLE001
        pass

    return {
        "totalScanned": len(devices.get("result", [])),
        "lowBatteryDevices": low_battery,
    }


@mcp.tool()
async def network_overview() -> dict[str, Any]:
    """Vue réseau : devices/gateways total et offline."""
    devices = await cs.list_devices(limit=200)
    gateways = await cs.list_gateways(limit=200)
    now = datetime.now(timezone.utc)

    offline_devices = 0
    for item in devices.get("result", []):
        device = item.get("device", item)
        last_seen = _parse_last_seen(device.get("lastSeenAt"))
        if last_seen is None or (now - last_seen.astimezone(timezone.utc)).total_seconds() > 3600:
            offline_devices += 1

    offline_gateways = 0
    for item in gateways.get("result", []):
        gw = item.get("gateway", item)
        last_seen = _parse_last_seen(gw.get("lastSeenAt"))
        if last_seen is None or (now - last_seen.astimezone(timezone.utc)).total_seconds() > 600:
            offline_gateways += 1

    return {
        "deviceCount": devices.get("totalCount", 0),
        "gatewayCount": gateways.get("totalCount", 0),
        "offlineDevices": offline_devices,
        "offlineGateways": offline_gateways,
    }


# ── Compteurs d'eau Shengda ───────────────────────────────────────────────────


@mcp.tool()
async def list_water_meters(limit: int = 50) -> dict[str, Any]:
    """Liste les compteurs d'eau Shengda avec dernier index m³, batterie et état vanne."""
    return await shengda.list_meters(limit=min(limit, 200))


@mcp.tool()
async def get_water_meter_telemetry(dev_eui: str, readings_limit: int = 5) -> dict[str, Any]:
    """Mesures actuelles d'un compteur d'eau : index m³, batterie (V), vanne, alarmes et historique récent."""
    return await shengda.get_meter_telemetry(dev_eui, readings_limit=min(readings_limit, 20))


@mcp.tool()
async def get_water_meter_readings(dev_eui: str, limit: int = 20) -> dict[str, Any]:
    """Historique des relevés décodés d'un compteur d'eau (index, batterie, vanne par uplink)."""
    return await shengda.list_readings(dev_eui.strip().lower(), limit=min(limit, 50))


@mcp.tool()
async def decode_water_meter_payload(payload: str) -> dict[str, Any]:
    """Décode une trame Shengda (hex ou base64 ChirpStack) en index m³, batterie, vanne."""
    return await shengda.decode_payload(payload)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_tags(tags_json: str) -> dict[str, str] | None:
    if not tags_json.strip():
        return None
    import json

    parsed = json.loads(tags_json)
    if not isinstance(parsed, dict):
        raise ValueError("tags_json doit être un objet JSON")
    return {str(k): str(v) for k, v in parsed.items()}


def _radio_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"message": "Aucun uplink récent"}
    rssis = [r["rssi"] for r in rows if r.get("rssi") is not None]
    snrs = [r["snr"] for r in rows if r.get("snr") is not None]
    return {
        "uplinkCount": len(rows),
        "avgRssi": round(sum(rssis) / len(rssis), 1) if rssis else None,
        "avgSnr": round(sum(snrs) / len(snrs), 1) if snrs else None,
        "lastDr": rows[0].get("dr"),
        "lastSf": rows[0].get("sf"),
    }


@mcp.resource("lorawan://platform/config")
def platform_config() -> dict[str, str]:
    """Configuration plateforme LoRaWAN."""
    return {
        "chirpstackRestUrl": cs.base_url,
        "tenantId": cs.tenant_id or "(non configuré)",
        "mcpVersion": "0.2.0",
        "tools": "read, write, metrics, diagnostics, water-meters, integrations",
        "sseEndpoint": f"http://{os.getenv('MCP_PUBLIC_HOST', 'localhost')}:{os.getenv('MCP_PORT', '8095')}/sse",
    }


@mcp.tool()
async def ingest_lorawan_uplink(event: dict[str, Any]) -> dict[str, Any]:
    """Reçoit un événement uplink LoRaWAN (connecteur MCP entrant / test intégration)."""
    dev_eui = ""
    if isinstance(event.get("device"), dict):
        dev_eui = str(event["device"].get("devEui") or "")
    return {
        "accepted": True,
        "tenantId": cs.tenant_id or chirpstack_tenant_id.get() or "",
        "devEui": dev_eui,
        "event": event.get("event", "uplink"),
    }


@mcp.tool()
async def lorawan_mcp_ping(message: str = "ping") -> dict[str, str]:
    """Test de connectivité MCP depuis une application métier."""
    return {
        "status": "ok",
        "message": message,
        "tenantId": cs.tenant_id or chirpstack_tenant_id.get() or "",
    }


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", "8095"))

    if transport == "sse":
        mcp.run(transport="sse", host=host, port=port)
    else:
        mcp.run()


if __name__ == "__main__":
    main()
