"""Décodage trames uplink Shengda (format TV + CS)."""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass, field
from typing import Any

from shengda_water.protocol.constants import (
    FRAME_HEADER_UPLINK,
    METER_TYPE_LABELS,
    PULSE_LITERS,
    TRIGGER_LABELS,
    TYPE_LENGTHS,
)


@dataclass
class ShengdaReading:
    frame_header: int | None = None
    packet_sequence: int | None = None
    meter_number: int | None = None
    meter_type: int | None = None
    meter_type_label: str | None = None
    metering_mode: int | None = None
    pulse_count: int | None = None
    index_liters: int | None = None
    index_m3: float | None = None
    pulse_constant: int | None = None
    pulse_constant_label: str | None = None
    battery_raw: int | None = None
    battery_v: float | None = None
    status_word_1: int | None = None
    status_word_2: int | None = None
    valve_open: bool | None = None
    valve_fault: bool | None = None
    battery_low: bool | None = None
    magnetic_attack: bool | None = None
    trigger_source: int | None = None
    trigger_label: str | None = None
    items: dict[int, bytes] = field(default_factory=dict)
    checksum_ok: bool | None = None
    raw_hex: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "frameHeader": self.frame_header,
            "packetSequence": self.packet_sequence,
            "meterNumber": self.meter_number,
            "meterType": self.meter_type,
            "meterTypeLabel": self.meter_type_label,
            "meteringMode": self.metering_mode,
            "pulseCount": self.pulse_count,
            "indexLiters": self.index_liters,
            "indexM3": self.index_m3,
            "pulseConstant": self.pulse_constant,
            "pulseConstantLabel": self.pulse_constant_label,
            "batteryRaw": self.battery_raw,
            "batteryV": self.battery_v,
            "statusWord1": self.status_word_1,
            "statusWord2": self.status_word_2,
            "valveOpen": self.valve_open,
            "valveFault": self.valve_fault,
            "batteryLow": self.battery_low,
            "magneticAttack": self.magnetic_attack,
            "triggerSource": self.trigger_source,
            "triggerLabel": self.trigger_label,
            "checksumOk": self.checksum_ok,
            "rawHex": self.raw_hex,
        }


def _parse_type(data: bytes, offset: int) -> tuple[int, int]:
    """Retourne (type_id, octets consommés pour le type)."""
    if offset >= len(data):
        raise ValueError("truncated type byte")
    t0 = data[offset]
    if t0 & 0x40:
        if offset + 1 >= len(data):
            raise ValueError("truncated extended type")
        t1 = data[offset + 1]
        type_id = ((t0 & 0x3F) << 8) | t1
        return type_id, 2
    return t0 & 0x3F, 1


def _read_tv_items(data: bytes, start: int, end: int) -> dict[int, bytes]:
    items: dict[int, bytes] = {}
    i = start
    while i < end:
        t0 = data[i]
        has_length = bool(t0 & 0x80)
        type_id, type_size = _parse_type(data, i)
        i += type_size

        if has_length:
            if i >= end:
                break
            length = data[i]
            i += 1
            value = data[i : i + length]
            i += length
        else:
            length = TYPE_LENGTHS.get(type_id)
            if length is None:
                break
            value = data[i : i + length]
            i += length

        if len(value) != (length if has_length else TYPE_LENGTHS.get(type_id, len(value))):
            break
        items[type_id] = value
    return items


def normalize_payload_hex(payload: str) -> str:
    """Accepte hex ou base64 (ChirpStack MQTT / NATS)."""
    raw = payload.strip().replace(" ", "")
    if not raw:
        return ""
    try:
        bytes.fromhex(raw)
        return raw.lower()
    except ValueError:
        pass
    return binascii.hexlify(base64.b64decode(raw)).decode()


def decode_payload(hex_payload: str) -> ShengdaReading:
    normalized = normalize_payload_hex(hex_payload)
    if not normalized:
        return ShengdaReading(raw_hex="")
    raw = bytes.fromhex(normalized)
    reading = ShengdaReading(raw_hex=normalized)

    if not raw:
        return reading

    if raw[0] in (FRAME_HEADER_UPLINK, 0x25, 0x26):
        reading.frame_header = raw[0]
        body_end = len(raw) - 1
        if body_end > 0:
            cs = raw[-1]
            reading.checksum_ok = (sum(raw[:-1]) & 0xFF) == cs
        items = _read_tv_items(raw, 1, body_end)
    else:
        items = _read_tv_items(raw, 0, len(raw))

    reading.items = items
    _apply_known_fields(reading, items)
    return reading


def _u32_be(b: bytes) -> int:
    return int.from_bytes(b, "big")


def _apply_known_fields(reading: ShengdaReading, items: dict[int, bytes]) -> None:
    if 0x19 in items:
        reading.packet_sequence = items[0x19][0]
    if 0x16 in items:
        reading.meter_number = _u32_be(items[0x16])
    if 0x1B in items:
        reading.meter_type = items[0x1B][0]
        reading.meter_type_label = METER_TYPE_LABELS.get(reading.meter_type, "unknown")
    if 0x12 in items:
        reading.metering_mode = items[0x12][0]
    if 0x0B in items:
        reading.pulse_count = _u32_be(items[0x0B])
    if 0x14 in items:
        reading.pulse_constant = items[0x14][0]
        liters = PULSE_LITERS.get(reading.pulse_constant)
        if liters:
            reading.pulse_constant_label = f"{liters} L/pulse"
    if 0x1A in items and len(items[0x1A]) >= 2:
        raw16 = int.from_bytes(items[0x1A], "big")
        reading.battery_raw = raw16
        reading.battery_v = round(raw16 / 16.4, 2)
    if 0x33 in items and len(items[0x33]) >= 2:
        sw1 = items[0x33][0]
        sw2 = items[0x33][1]
        reading.status_word_1 = sw1
        reading.status_word_2 = sw2
        reading.valve_fault = bool(sw1 & 0x80)
        reading.battery_low = bool(sw1 & 0x40)
        reading.magnetic_attack = bool(sw1 & 0x20)
        reading.valve_open = not bool(sw1 & 0x04)
    if 0x23 in items:
        reading.trigger_source = items[0x23][0]
        reading.trigger_label = TRIGGER_LABELS.get(reading.trigger_source, "other")

    if reading.pulse_count is not None:
        liters_per_pulse = PULSE_LITERS.get(reading.pulse_constant or 0x01, 1)
        reading.index_liters = reading.pulse_count * liters_per_pulse
        reading.index_m3 = round(reading.index_liters / 1000, 3)
