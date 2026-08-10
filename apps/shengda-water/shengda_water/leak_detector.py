"""Détection de fuites d'eau à partir des relevés Shengda."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from shengda_water.protocol.decoder import ShengdaReading

DEFAULT_FLOW_THRESHOLD_M3H = 0.05
DEFAULT_NIGHT_FLOW_THRESHOLD_M3H = 0.02
DEFAULT_NIGHT_START = 22
DEFAULT_NIGHT_END = 6
DEFAULT_MIN_INTERVAL_MINUTES = 5


@dataclass(frozen=True)
class LeakSettings:
    enabled: bool = True
    flow_threshold_m3h: float = DEFAULT_FLOW_THRESHOLD_M3H
    night_flow_threshold_m3h: float = DEFAULT_NIGHT_FLOW_THRESHOLD_M3H
    night_start_hour: int = DEFAULT_NIGHT_START
    night_end_hour: int = DEFAULT_NIGHT_END
    min_interval_minutes: int = DEFAULT_MIN_INTERVAL_MINUTES

    @classmethod
    def from_row(cls, row: dict[str, Any] | None) -> LeakSettings:
        if not row:
            return cls()
        return cls(
            enabled=bool(row.get("enabled", True)),
            flow_threshold_m3h=float(row.get("flow_threshold_m3h") or DEFAULT_FLOW_THRESHOLD_M3H),
            night_flow_threshold_m3h=float(row.get("night_flow_threshold_m3h") or DEFAULT_NIGHT_FLOW_THRESHOLD_M3H),
            night_start_hour=int(row.get("night_start_hour") or DEFAULT_NIGHT_START),
            night_end_hour=int(row.get("night_end_hour") or DEFAULT_NIGHT_END),
            min_interval_minutes=int(row.get("min_interval_minutes") or DEFAULT_MIN_INTERVAL_MINUTES),
        )


@dataclass(frozen=True)
class LeakCandidate:
    leak_type: str
    severity: str
    title: str
    details: dict[str, Any]
    flow_m3h: float | None = None


def _is_night_hour(dt: datetime, start: int, end: int) -> bool:
    hour = dt.hour
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end


def compute_flow_m3h(
    current_index_m3: float,
    current_time: datetime,
    previous_index_m3: float,
    previous_time: datetime,
    *,
    min_interval_minutes: int,
) -> float | None:
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    if previous_time.tzinfo is None:
        previous_time = previous_time.replace(tzinfo=timezone.utc)

    delta_seconds = (current_time - previous_time).total_seconds()
    if delta_seconds <= 0:
        return None
    delta_hours = delta_seconds / 3600.0
    if delta_hours < (min_interval_minutes / 60.0):
        return None
    if delta_hours > 48:
        return None

    delta_index = current_index_m3 - previous_index_m3
    if delta_index < 0:
        return None
    if delta_index == 0:
        return 0.0
    return round(delta_index / delta_hours, 4)


def detect_leaks(
    reading: ShengdaReading,
    *,
    settings: LeakSettings,
    event_time: datetime | None,
    previous_index_m3: float | None,
    previous_time: datetime | None,
) -> tuple[list[LeakCandidate], float | None]:
    """Retourne les alertes potentielles et le débit calculé (m³/h)."""
    if not settings.enabled:
        return [], None

    candidates: list[LeakCandidate] = []
    flow_m3h: float | None = None
    when = event_time or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)

    if reading.flow_alarm:
        candidates.append(
            LeakCandidate(
                leak_type="device_flow_alarm",
                severity="critical",
                title="Alarme débit compteur (flowAlarm)",
                details={"source": "device", "field": "flowAlarm"},
            )
        )

    if reading.water_inlet_alarm:
        candidates.append(
            LeakCandidate(
                leak_type="device_inlet_alarm",
                severity="critical",
                title="Alarme entrée d'eau (waterInletAlarm)",
                details={"source": "device", "field": "waterInletAlarm"},
            )
        )

    if reading.water_return_alarm:
        candidates.append(
            LeakCandidate(
                leak_type="device_return_alarm",
                severity="warning",
                title="Alarme retour d'eau (waterReturnAlarm)",
                details={"source": "device", "field": "waterReturnAlarm"},
            )
        )

    if reading.meter_status_label == "flow_overload":
        candidates.append(
            LeakCandidate(
                leak_type="flow_overload",
                severity="warning",
                title="Surcharge de débit (flow_overload)",
                details={
                    "source": "device",
                    "meterStatus": reading.meter_status,
                    "meterStatusLabel": reading.meter_status_label,
                },
            )
        )

    if (
        reading.index_m3 is not None
        and previous_index_m3 is not None
        and previous_time is not None
    ):
        flow_m3h = compute_flow_m3h(
            float(reading.index_m3),
            when,
            float(previous_index_m3),
            previous_time,
            min_interval_minutes=settings.min_interval_minutes,
        )

        if flow_m3h is not None and flow_m3h > 0:
            if reading.valve_open is False and flow_m3h >= settings.flow_threshold_m3h:
                candidates.append(
                    LeakCandidate(
                        leak_type="flow_with_valve_closed",
                        severity="critical",
                        title="Consommation avec vanne fermée",
                        details={
                            "source": "calculated",
                            "flowM3h": flow_m3h,
                            "thresholdM3h": settings.flow_threshold_m3h,
                            "valveOpen": False,
                        },
                        flow_m3h=flow_m3h,
                    )
                )
            elif reading.valve_open is not False and flow_m3h >= settings.flow_threshold_m3h:
                candidates.append(
                    LeakCandidate(
                        leak_type="high_continuous_flow",
                        severity="warning",
                        title="Débit continu anormalement élevé",
                        details={
                            "source": "calculated",
                            "flowM3h": flow_m3h,
                            "thresholdM3h": settings.flow_threshold_m3h,
                            "valveOpen": reading.valve_open,
                        },
                        flow_m3h=flow_m3h,
                    )
                )

            if _is_night_hour(when, settings.night_start_hour, settings.night_end_hour):
                if flow_m3h >= settings.night_flow_threshold_m3h:
                    candidates.append(
                        LeakCandidate(
                            leak_type="night_flow",
                            severity="warning",
                            title="Consommation nocturne suspecte",
                            details={
                                "source": "calculated",
                                "flowM3h": flow_m3h,
                                "thresholdM3h": settings.night_flow_threshold_m3h,
                                "localHour": when.hour,
                            },
                            flow_m3h=flow_m3h,
                        )
                    )

    enriched: list[LeakCandidate] = []
    for candidate in candidates:
        enriched.append(
            LeakCandidate(
                leak_type=candidate.leak_type,
                severity=candidate.severity,
                title=candidate.title,
                details=candidate.details,
                flow_m3h=candidate.flow_m3h if candidate.flow_m3h is not None else flow_m3h,
            )
        )

    return enriched, flow_m3h
