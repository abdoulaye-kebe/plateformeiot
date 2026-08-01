"""Encodage commandes downlink Shengda (port 2, confirmé)."""

from __future__ import annotations

import base64

from shengda_water.protocol.constants import DOWNLINK_FPORT, FRAME_HEADER_DOWNLINK, VALVE_ACTIONS


def checksum(body: bytes) -> int:
    return sum(body) & 0xFF


def build_downlink(*parts: bytes) -> bytes:
    body = b"".join(parts)
    return body + bytes([checksum(body)])


def valve_command(action: str) -> dict[str, str | int | bool]:
    """Construit une commande vanne (open/close/dredge/...)."""
    code = VALVE_ACTIONS.get(action)
    if code is None:
        raise ValueError(f"action vanne inconnue: {action}")

    payload = build_downlink(bytes([FRAME_HEADER_DOWNLINK, 0x1F, code]))
    return _command_result(payload)


def read_meter_info_command() -> dict[str, str | int | bool]:
    """Demande de télérelevé forcé (T=0x20, V=0x01)."""
    payload = build_downlink(bytes([FRAME_HEADER_DOWNLINK, 0x20, 0x01]))
    return _command_result(payload)


def _command_result(payload: bytes) -> dict[str, str | int | bool]:
    return {
        "fPort": DOWNLINK_FPORT,
        "confirmed": True,
        "payloadHex": payload.hex(),
        "payloadBase64": base64.b64encode(payload).decode("ascii"),
    }


def set_u32_parameter(type_id: int, value: int) -> dict[str, str | int | bool]:
    """Paramètre downlink TV 4 octets (big-endian)."""
    if type_id > 0x3F:
        raise ValueError(f"type_id invalide: {type_id:#x}")
    payload = build_downlink(bytes([FRAME_HEADER_DOWNLINK, type_id]) + int(value).to_bytes(4, "big"))
    return _command_result(payload)


def set_u8_parameter(type_id: int, value: int) -> dict[str, str | int | bool]:
    """Paramètre downlink TV 1 octet."""
    if type_id > 0x3F:
        raise ValueError(f"type_id invalide: {type_id:#x}")
    payload = build_downlink(bytes([FRAME_HEADER_DOWNLINK, type_id, value & 0xFF]))
    return _command_result(payload)


def timing_interval_command(seconds: int) -> dict[str, str | int | bool]:
    """Intervalle de rapport périodique (T=0x25, 600..86400 s)."""
    if not 600 <= seconds <= 86400:
        raise ValueError("interval_seconds must be between 600 and 86400")
    return set_u32_parameter(0x25, seconds)


def report_start_hour_command(hour: int) -> dict[str, str | int | bool]:
    """Heure de début de rapport (T=0x2B, 0..23 h)."""
    if not 0 <= hour <= 23:
        raise ValueError("report_hour must be between 0 and 23")
    return set_u8_parameter(0x2B, hour)
