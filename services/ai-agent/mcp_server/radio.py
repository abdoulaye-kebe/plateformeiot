"""Helpers pour extraire métriques radio des événements ChirpStack."""

from __future__ import annotations

from typing import Any


def parse_radio_from_events(events_payload: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
    """Extrait RSSI, SNR, DR/SF des derniers uplinks."""
    rows: list[dict[str, Any]] = []
    for item in events_payload.get("result", [])[:limit]:
        event = item.get("event", item)
        if event.get("type") not in (None, "up", "join"):
            continue

        tx_info = event.get("txInfo") or {}
        dr = tx_info.get("dr") or tx_info.get("dataRate", {}).get("lora", {}).get("spreadingFactor")
        frequency = tx_info.get("frequency")

        for rx in event.get("rxInfo") or []:
            rows.append(
                {
                    "time": event.get("time") or rx.get("time"),
                    "gatewayId": rx.get("gatewayId"),
                    "rssi": rx.get("rssi"),
                    "snr": rx.get("snr"),
                    "dr": dr,
                    "sf": dr,
                    "frequency": frequency,
                    "fCnt": event.get("fCnt"),
                    "adr": event.get("adr"),
                }
            )
    return rows


def summarize_link_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    """Résume les métriques link ChirpStack (derniers points RSSI/SNR)."""

    def last_points(metric: dict[str, Any] | None) -> list[Any]:
        if not metric:
            return []
        dataset = metric.get("datasets", [{}])
        if not dataset:
            return []
        return dataset[0].get("data", [])[-5:]

    return {
        "gwRssiLast": last_points(metrics.get("gwRssi")),
        "gwSnrLast": last_points(metrics.get("gwSnr")),
        "rxPacketsLast": last_points(metrics.get("rxPackets")),
        "rxPacketsPerDr": metrics.get("rxPacketsPerDr"),
    }
