"""Constantes protocole Shengda Application Layer V1.6."""

FRAME_HEADER_UPLINK = 0x24
FRAME_HEADER_DOWNLINK = 0x26
DOWNLINK_FPORT = 2

# Longueur fixe des types T (sans drapeau L) — voir doc V1.6 §3.
TYPE_LENGTHS: dict[int, int] = {
    0x01: 4,
    0x02: 4,
    0x03: 4,
    0x04: 4,
    0x05: 1,
    0x06: 3,
    0x07: 3,
    0x08: 3,
    0x09: 1,
    0x0A: 2,
    0x0B: 4,
    0x0C: 4,
    0x0D: 4,
    0x0E: 4,
    0x0F: 1,
    0x10: 1,
    0x11: 1,
    0x12: 1,
    0x13: 4,
    0x14: 1,
    0x15: 1,
    0x16: 4,
    0x17: 1,
    0x19: 1,
    0x1A: 2,
    0x1B: 1,
    0x1C: 6,
    0x1D: 3,
    0x1E: 8,
    0x1F: 1,
    0x20: 1,
    0x21: 4,
    0x23: 1,
    0x24: 1,
    0x25: 4,
    0x26: 4,
    0x27: 4,
    0x28: 4,
    0x29: 4,
    0x2A: 4,
    0x2B: 1,
    0x2C: 2,
    0x2D: 2,
    0x2E: 1,
    0x33: 2,
    0x34: 8,
    0x35: 16,
    0x36: 2,
    0x37: 1,
    0x38: 4,
}

PULSE_LITERS: dict[int, int] = {
    0x01: 1,
    0x02: 10,
    0x03: 100,
    0x04: 1000,
}

METER_TYPE_LABELS: dict[int, str] = {
    0x00: "water",
    0x01: "gas",
    0x02: "heat",
    0x03: "electricity",
    0x04: "gas_sensor",
}

TRIGGER_LABELS: dict[int, str] = {
    0x00: "magnetic",
    0x01: "routine",
    0x02: "magnetic_attack",
    0x03: "valve_control",
    0x04: "platform_read",
    0x0A: "dredge_valve",
    0x0E: "timing_interval",
    0x13: "abnormal_alarm",
}

VALVE_ACTIONS: dict[str, int] = {
    "open": 0x00,
    "close": 0x01,
    "dredge": 0x02,
    "dredge_schedule_on": 0x03,
    "dredge_schedule_off": 0x04,
}
