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
    return {
        "fPort": DOWNLINK_FPORT,
        "confirmed": True,
        "payloadHex": payload.hex(),
        "payloadBase64": base64.b64encode(payload).decode("ascii"),
    }


def read_meter_info_command() -> dict[str, str | int | bool]:
    """Demande de télérelevé forcé (T=0x20, V=0x01)."""
    payload = build_downlink(bytes([FRAME_HEADER_DOWNLINK, 0x20, 0x01]))
    return {
        "fPort": DOWNLINK_FPORT,
        "confirmed": True,
        "payloadHex": payload.hex(),
        "payloadBase64": base64.b64encode(payload).decode("ascii"),
    }
