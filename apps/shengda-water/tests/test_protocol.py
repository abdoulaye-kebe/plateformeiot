"""Tests protocole Shengda V1.6."""

from shengda_water.protocol.decoder import decode_payload
from shengda_water.protocol.encoder import valve_command


def test_valve_open_hex():
    cmd = valve_command("open")
    assert cmd["payloadHex"] == "261f0045"
    assert cmd["fPort"] == 2


def test_valve_close_hex():
    cmd = valve_command("close")
    assert cmd["payloadHex"] == "261f0146"


def test_battery_decode():
    reading = decode_payload("241A003c")
    assert reading.battery_raw == 0x003C
    assert reading.battery_v == 3.66


def test_status_word_decode():
    # Status word 1: valve closed (B2=1), battery low (B6=1) → 0x44
    # Status word 2: flow overload (010) + water inlet alarm (B7=1) → 0xA8
    reading = decode_payload("3344A8")
    assert reading.status_word_1 == 0x44
    assert reading.valve_open is False
    assert reading.battery_low is True
    assert reading.water_inlet_alarm is True
    assert reading.meter_status == 2
    assert reading.meter_status_label == "flow_overload"


def test_regular_report_trigger_routine():
    # Exemple rapport régulier (§16) — trigger routine (0x01)
    hex_payload = (
        "241605f5e10414010b000186231a003c3300002301"
    )
    reading = decode_payload(hex_payload)
    assert reading.packet_sequence == 5
    assert reading.meter_number == 0xF5E10414
    assert reading.meter_type_label == "water"
    assert reading.pulse_constant == 0x01
    assert reading.pulse_count == 0x18623
    assert reading.battery_v == 3.66
    assert reading.trigger_label == "routine"
    assert reading.index_m3 == round(0x18623 / 1000, 3)

