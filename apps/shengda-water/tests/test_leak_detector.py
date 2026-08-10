"""Tests détection de fuites."""

from datetime import datetime, timezone

from shengda_water.leak_detector import LeakSettings, compute_flow_m3h, detect_leaks
from shengda_water.protocol.decoder import ShengdaReading, decode_payload


def test_compute_flow_m3h():
    t0 = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 8, 1, 11, 0, tzinfo=timezone.utc)
    flow = compute_flow_m3h(10.5, t1, 10.0, t0, min_interval_minutes=5)
    assert flow == 0.5


def test_device_flow_alarm():
    reading = decode_payload("3344A8")
    leaks, flow = detect_leaks(
        reading,
        settings=LeakSettings(),
        event_time=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
        previous_index_m3=None,
        previous_time=None,
    )
    types = {leak.leak_type for leak in leaks}
    assert "device_inlet_alarm" in types
    assert "flow_overload" in types
    assert flow is None


def test_flow_with_valve_closed():
    reading = ShengdaReading(index_m3=10.2, valve_open=False)
    t0 = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 8, 1, 11, 0, tzinfo=timezone.utc)
    leaks, flow = detect_leaks(
        reading,
        settings=LeakSettings(flow_threshold_m3h=0.05),
        event_time=t1,
        previous_index_m3=10.0,
        previous_time=t0,
    )
    assert flow == 0.2
    assert any(leak.leak_type == "flow_with_valve_closed" for leak in leaks)


def test_night_flow():
    reading = ShengdaReading(index_m3=10.05, valve_open=True)
    t0 = datetime(2026, 8, 1, 2, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 8, 1, 3, 0, tzinfo=timezone.utc)
    leaks, _ = detect_leaks(
        reading,
        settings=LeakSettings(night_flow_threshold_m3h=0.02),
        event_time=t1,
        previous_index_m3=10.0,
        previous_time=t0,
    )
    assert any(leak.leak_type == "night_flow" for leak in leaks)
