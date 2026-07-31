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


def test_monthly_frozen_sample():
    reading = decode_payload("24190d1d1304000d0000c35014032307df")
    assert reading.frame_header == 0x24
    assert reading.checksum_ok is True
