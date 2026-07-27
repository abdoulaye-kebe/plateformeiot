"""Formatage des résultats MCP en français (sans LLM)."""

from __future__ import annotations

import json
from typing import Any


def format_tool_result(tool_name: str, raw: str, intent: str | None = None) -> str:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return raw

    if intent == "count" and tool_name == "list_gateways":
        return _format_count_gateways(data)
    if intent == "count" and tool_name == "list_devices":
        return _format_count_devices(data)

    formatters = {
        "network_overview": _format_network_overview,
        "list_gateways": _format_list_gateways,
        "list_devices": _format_list_devices,
        "list_applications": _format_list_applications,
        "find_low_battery_devices": _format_low_battery,
        "create_gateway": _format_create_gateway,
        "create_device": _format_create_device,
        "get_device_radio_info": _format_device_radio,
    }
    fn = formatters.get(tool_name)
    if fn:
        return fn(data)
    return json.dumps(data, ensure_ascii=False, indent=2)


def _format_network_overview(data: dict[str, Any]) -> str:
    return (
        "Vue réseau LoRaWAN\n"
        f"- Devices total    : {data.get('deviceCount', '—')}\n"
        f"- Gateways total   : {data.get('gatewayCount', '—')}\n"
        f"- Devices offline  : {data.get('offlineDevices', '—')}\n"
        f"- Gateways offline : {data.get('offlineGateways', '—')}"
    )


def _format_list_gateways(data: dict[str, Any]) -> str:
    items = data.get("result", [])
    if not items:
        return "Aucune gateway enregistrée."
    lines = [f"Gateways ({data.get('totalCount', len(items))}) :"]
    for item in items[:20]:
        gw = item.get("gateway", item)
        lines.append(f"  • {gw.get('name', '?')} — {gw.get('gatewayId', '?')} — last seen: {gw.get('lastSeenAt', 'jamais')}")
    return "\n".join(lines)


def _format_count_gateways(data: dict[str, Any]) -> str:
    items = data.get("result", [])
    n = int(data.get("totalCount", len(items)))
    if n == 0:
        return "Vous avez 0 gateway enregistrée."
    suffix = "s" if n > 1 else ""
    lines = [f"Vous avez {n} gateway{suffix} enregistrée{suffix} :"]
    for item in items[:20]:
        gw = item.get("gateway", item)
        seen = gw.get("lastSeenAt") or "jamais vu"
        lines.append(f"  • {gw.get('name', '?')} ({gw.get('gatewayId', '?')}) — {seen}")
    return "\n".join(lines)


def _format_count_devices(data: dict[str, Any]) -> str:
    items = data.get("result", [])
    n = int(data.get("totalCount", len(items)))
    if n == 0:
        return "Vous avez 0 device enregistré."
    suffix = "s" if n > 1 else ""
    lines = [f"Vous avez {n} device{suffix} enregistré{suffix} :"]
    for item in items[:20]:
        dev = item.get("device", item)
        seen = dev.get("lastSeenAt") or "jamais vu"
        lines.append(f"  • {dev.get('name', '?')} ({dev.get('devEui', '?')}) — {seen}")
    return "\n".join(lines)


def _format_list_devices(data: dict[str, Any]) -> str:
    items = data.get("result", [])
    if not items:
        return "Aucun device enregistré."
    lines = [f"Devices ({data.get('totalCount', len(items))}) :"]
    for item in items[:20]:
        dev = item.get("device", item)
        lines.append(f"  • {dev.get('name', '?')} — {dev.get('devEui', '?')} — last seen: {dev.get('lastSeenAt', 'jamais')}")
    return "\n".join(lines)


def _format_list_applications(data: dict[str, Any]) -> str:
    items = data.get("result", [])
    if not items:
        return "Aucune application. Créez-en une dans ChirpStack UI."
    lines = [f"Applications ({data.get('totalCount', len(items))}) :"]
    for item in items:
        app = item.get("application", item)
        lines.append(f"  • {app.get('name', '?')} — id: {app.get('id', '?')}")
    return "\n".join(lines)


def _format_low_battery(data: dict[str, Any]) -> str:
    items = data.get("lowBatteryDevices", [])
    if not items:
        return f"Aucun device batterie faible (scannés: {data.get('totalScanned', 0)})."
    lines = ["Devices batterie faible :"]
    for d in items:
        lines.append(f"  • {d.get('name', '?')} ({d.get('devEui')}) — {d.get('battery')}%")
    return "\n".join(lines)


def _format_create_gateway(data: dict[str, Any]) -> str:
    if data.get("ok"):
        return f"Gateway créée : {data.get('name')} ({data.get('gatewayId')})"
    if "error" in data:
        err = str(data["error"])
        if "duplicate key" in err or "gateway_pkey" in err:
            return f"Gateway {data.get('gatewayId', '?')} existe déjà dans ChirpStack."
        return f"Erreur ChirpStack : {err}"
    return json.dumps(data, ensure_ascii=False, indent=2)


def _format_create_device(data: dict[str, Any]) -> str:
    if data.get("ok"):
        lines = [f"Device créé : {data.get('name')} ({data.get('devEui')})"]
        if data.get("applicationId"):
            lines.append(f"- Application : {data['applicationId']}")
        if data.get("joinEui"):
            lines.append(f"- JoinEUI : {data['joinEui']}")
        if data.get("keysConfigured"):
            lines.append("- Clés OTAA (AppKey) : configurées")
        if data.get("warning"):
            lines.append(f"⚠ {data['warning']}")
        return "\n".join(lines)
    if data.get("error"):
        err = str(data["error"])
        if "existe déjà" in err or "duplicate" in err.lower():
            return f"Le device {data.get('devEui', '?')} existe déjà dans ChirpStack."
        return f"Erreur ChirpStack : {err}"
    return json.dumps(data, ensure_ascii=False, indent=2)


def _format_device_radio(data: dict[str, Any]) -> str:
    summary = data.get("summary") or {}
    if summary.get("message"):
        return f"Device {data.get('devEui')} : {summary['message']}"
    lines = [
        f"Radio — {data.get('name') or data.get('devEui')}",
        f"- Batterie (tag) : {data.get('batteryTag', 'non renseignée')}",
        f"- Dernier DR/SF  : {summary.get('lastDr', '—')}",
        f"- RSSI moyen     : {summary.get('avgRssi', '—')} dBm",
        f"- SNR moyen      : {summary.get('avgSnr', '—')} dB",
        f"- Uplinks analysés: {summary.get('uplinkCount', 0)}",
    ]
    recent = data.get("recentUplinks") or []
    if recent:
        last = recent[0]
        lines.append(f"- Dernier uplink  : RSSI={last.get('rssi')} SNR={last.get('snr')} GW={last.get('gatewayId')}")
    return "\n".join(lines)
