"""Constantes protocole Shengda Application Layer V1.6 (document fournisseur).

Format trame uplink : FrameHeader (0x24) + TV… + CS (somme modulo 256).
Rapport régulier (§16) : séquence, n° compteur, type, mode mesure, impulsions (0x0B),
constante impulsion (0x14), batterie (0x1A), status word (0x33), trigger (0x23).
"""

FRAME_HEADER_UPLINK = 0x24
FRAME_HEADER_DOWNLINK = 0x26
FRAME_HEADER_CMD = 0x25
DOWNLINK_FPORT = 2

# Longueur fixe des types T sans drapeau L (BIT7=0) — doc §3.
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

# Pulse constant PN (T=0x14) — doc §6.
PULSE_LITERS: dict[int, int] = {
    0x01: 1,
    0x02: 10,
    0x03: 100,
    0x04: 1000,
}

# Meter type (T=0x1B) — doc §8.
METER_TYPE_LABELS: dict[int, str] = {
    0x00: "water",
    0x01: "gas",
    0x02: "heat",
    0x03: "electricity",
    0x04: "gas_sensor",
}

# Metering mode (T=0x12) — doc §5.
METERING_MODE_LABELS: dict[int, str] = {
    0x00: "dual_reed",
    0x01: "single_reed",
    0x02: "dual_hall",
    0x03: "direct_reading",
    0x04: "non_magnetic_inductive",
    0x05: "non_magnetic_coil",
    0x06: "triple_hall",
    0x07: "single_hall",
    0x08: "edc_u_pulse",
    0x09: "iuw_pulse",
    0x0A: "edc_b1_pulse",
    0x0B: "edc_b2_pulse",
    0x0C: "iuw_nfc_pulse",
    0x0D: "adc_acquisition",
    0x0E: "near_camera",
    0x0F: "remote_camera",
}

# Valve type (T=0x17) — doc §7.
VALVE_TYPE_LABELS: dict[int, str] = {
    0x00: "two_wire",
    0x01: "five_wire",
    0x02: "no_valve",
    0x03: "angle_valve",
    0x04: "four_wire",
}

# Trigger source (T=0x23) — doc §9.
TRIGGER_LABELS: dict[int, str] = {
    0x00: "magnetic",
    0x01: "routine",
    0x02: "magnetic_attack",
    0x03: "valve_control",
    0x04: "platform_read",
    0x05: "platform_version_read",
    0x06: "platform_param_set",
    0x07: "monthly_frozen",
    0x08: "yearly_frozen",
    0x09: "network_join",
    0x0A: "dredge_valve",
    0x0B: "network_param_change",
    0x0C: "valve_type_freq_change",
    0x0D: "upgrade_command",
    0x0E: "timing_interval",
    0x0F: "non_magnetic_alarm",
    0x10: "dense_sampling",
    0x11: "q3_valve",
    0x12: "lorawan_start",
    0x13: "abnormal_alarm",
    0xFF: "param_error",
}

# LoRaWAN class (T=0x09) — doc §3.3.
LORAWAN_CLASS_LABELS: dict[int, str] = {
    0x00: "class_a",
    0x01: "class_b",
    0x02: "class_c",
    0x03: "dual_mode",
}

VALVE_ACTIONS: dict[str, int] = {
    "open": 0x00,
    "close": 0x01,
    "dredge": 0x02,
    "dredge_schedule_on": 0x03,
    "dredge_schedule_off": 0x04,
}

# Status word 2 — meter status (bits B4-B2) — doc §4.1.
METER_STATUS_LABELS: dict[int, str] = {
    0b000: "normal",
    0b001: "empty_pipe",
    0b010: "flow_overload",
    0b100: "storage_fault",
    0b101: "transducer_fault",
    0b110: "wrong_direction",
}
