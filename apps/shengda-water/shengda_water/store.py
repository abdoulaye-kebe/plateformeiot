"""Persistance compteurs et relevés Shengda."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg

from shengda_water.protocol.decoder import ShengdaReading, decode_payload


class ShengdaStore:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def upsert_meter_from_reading(
        self,
        tenant_id: str,
        dev_eui: str,
        application_id: str | None,
        reading: ShengdaReading,
        name: str | None = None,
    ) -> None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO shengda_meters (
                        dev_eui, tenant_id, application_id, name, meter_number,
                        meter_type, pulse_constant, last_index_m3, last_index_liters,
                        valve_open, battery_v, status_word_1, status_word_2,
                        valve_fault, magnetic_attack, battery_low,
                        last_reading_at, updated_at
                    ) VALUES (
                        %s, %s::uuid, %s, COALESCE(%s, %s), %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        NOW(), NOW()
                    )
                    ON CONFLICT (dev_eui) DO UPDATE SET
                        tenant_id = EXCLUDED.tenant_id,
                        application_id = COALESCE(EXCLUDED.application_id, shengda_meters.application_id),
                        name = COALESCE(EXCLUDED.name, shengda_meters.name),
                        meter_number = COALESCE(EXCLUDED.meter_number, shengda_meters.meter_number),
                        meter_type = COALESCE(EXCLUDED.meter_type, shengda_meters.meter_type),
                        pulse_constant = COALESCE(EXCLUDED.pulse_constant, shengda_meters.pulse_constant),
                        last_index_m3 = COALESCE(EXCLUDED.last_index_m3, shengda_meters.last_index_m3),
                        last_index_liters = COALESCE(EXCLUDED.last_index_liters, shengda_meters.last_index_liters),
                        valve_open = COALESCE(EXCLUDED.valve_open, shengda_meters.valve_open),
                        battery_v = COALESCE(EXCLUDED.battery_v, shengda_meters.battery_v),
                        status_word_1 = COALESCE(EXCLUDED.status_word_1, shengda_meters.status_word_1),
                        status_word_2 = COALESCE(EXCLUDED.status_word_2, shengda_meters.status_word_2),
                        valve_fault = COALESCE(EXCLUDED.valve_fault, shengda_meters.valve_fault),
                        magnetic_attack = COALESCE(EXCLUDED.magnetic_attack, shengda_meters.magnetic_attack),
                        battery_low = COALESCE(EXCLUDED.battery_low, shengda_meters.battery_low),
                        last_reading_at = NOW(),
                        updated_at = NOW()
                    """,
                    (
                        dev_eui.lower(),
                        tenant_id,
                        application_id,
                        name,
                        dev_eui.lower(),
                        reading.meter_number,
                        reading.meter_type,
                        reading.pulse_constant,
                        reading.index_m3,
                        reading.index_liters,
                        reading.valve_open,
                        reading.battery_v,
                        reading.status_word_1,
                        reading.status_word_2,
                        reading.valve_fault,
                        reading.magnetic_attack,
                        reading.battery_low,
                    ),
                )
            conn.commit()

    def insert_reading(
        self,
        tenant_id: str,
        dev_eui: str,
        reading: ShengdaReading,
        f_cnt: int | None,
        f_port: int | None,
        event_time: datetime | None = None,
    ) -> None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO shengda_readings (
                        time, tenant_id, dev_eui, index_m3, index_liters,
                        pulse_count, battery_v, valve_open, valve_fault,
                        battery_low, magnetic_attack, trigger_source, trigger_label,
                        status_word_1, status_word_2, packet_sequence,
                        raw_hex, f_cnt, f_port, decoded
                    ) VALUES (
                        COALESCE(%s, NOW()), %s::uuid, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s::jsonb
                    )
                    """,
                    (
                        event_time,
                        tenant_id,
                        dev_eui.lower(),
                        reading.index_m3,
                        reading.index_liters,
                        reading.pulse_count,
                        reading.battery_v,
                        reading.valve_open,
                        reading.valve_fault,
                        reading.battery_low,
                        reading.magnetic_attack,
                        reading.trigger_source,
                        reading.trigger_label,
                        reading.status_word_1,
                        reading.status_word_2,
                        reading.packet_sequence,
                        reading.raw_hex,
                        f_cnt,
                        f_port,
                        psycopg.types.json.Json(reading.to_dict()),
                    ),
                )
            conn.commit()

    def resolve_platform_tenant_by_chirpstack(self, chirpstack_tenant_id: str) -> str | None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id::text FROM tenants
                    WHERE chirpstack_tenant_id = %s::uuid AND status = 'active'
                    LIMIT 1
                    """,
                    (chirpstack_tenant_id,),
                )
                row = cur.fetchone()
                return row[0] if row else None

    def resolve_tenant_by_application(self, application_id: str) -> str | None:
        if not application_id:
            return None
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT tenant_id::text FROM tenant_applications
                    WHERE chirpstack_application_id = %s::uuid
                    LIMIT 1
                    """,
                    (application_id,),
                )
                row = cur.fetchone()
                return row[0] if row else None

    def sync_meters_from_archives(self, tenant_id: str, limit: int = 100) -> int:
        """Importe les compteurs Shengda détectables depuis payload_archives."""
        synced = 0
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT ON (dev_eui)
                           dev_eui, application_id, payload_hex, f_port, f_cnt, time
                    FROM payload_archives
                    WHERE tenant_id = %s::uuid AND COALESCE(payload_hex, '') <> ''
                    ORDER BY dev_eui, time DESC
                    LIMIT %s
                    """,
                    (tenant_id, limit),
                )
                rows = cur.fetchall()
        for dev_eui, application_id, payload_hex, f_port, f_cnt, event_time in rows:
            try:
                reading = decode_payload(str(payload_hex))
            except Exception:
                continue
            if reading.index_m3 is None and reading.status_word_1 is None and reading.battery_v is None:
                continue
            self.upsert_meter_from_reading(tenant_id, dev_eui, application_id, reading)
            self.insert_reading(
                tenant_id,
                dev_eui,
                reading,
                f_cnt=f_cnt,
                f_port=f_port,
                event_time=event_time,
            )
            synced += 1
        return synced

    def get_latest_payload_archive(self, tenant_id: str, dev_eui: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT time, payload_hex, f_port, f_cnt
                    FROM payload_archives
                    WHERE tenant_id = %s::uuid AND dev_eui = %s
                      AND COALESCE(payload_hex, '') <> ''
                    ORDER BY time DESC
                    LIMIT 1
                    """,
                    (tenant_id, dev_eui.lower()),
                )
                row = cur.fetchone()
                if not row:
                    return None
                cols = [d[0] for d in cur.description]
                return dict(zip(cols, row, strict=True))

    def get_latest_dev_eui_with_payload(self, tenant_id: str) -> str | None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dev_eui FROM payload_archives
                    WHERE tenant_id = %s::uuid AND COALESCE(payload_hex, '') <> ''
                    ORDER BY time DESC
                    LIMIT 1
                    """,
                    (tenant_id,),
                )
                row = cur.fetchone()
                return row[0].lower() if row else None

    def list_meters(self, tenant_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dev_eui, name, meter_number, last_index_m3, last_index_liters,
                           valve_open, battery_v, status_word_1, magnetic_attack, battery_low,
                           last_reading_at, application_id
                    FROM shengda_meters
                    WHERE tenant_id = %s::uuid
                    ORDER BY last_reading_at DESC NULLS LAST, dev_eui
                    LIMIT %s
                    """,
                    (tenant_id, limit),
                )
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]

    def get_meter(self, tenant_id: str, dev_eui: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dev_eui, name, meter_number, meter_type, pulse_constant,
                           last_index_m3, last_index_liters, valve_open, battery_v,
                           status_word_1, status_word_2, magnetic_attack, battery_low,
                           valve_fault, last_reading_at, application_id
                    FROM shengda_meters
                    WHERE tenant_id = %s::uuid AND dev_eui = %s
                    """,
                    (tenant_id, dev_eui.lower()),
                )
                row = cur.fetchone()
                if not row:
                    return None
                cols = [d[0] for d in cur.description]
                return dict(zip(cols, row, strict=True))

    def list_readings(self, tenant_id: str, dev_eui: str, limit: int = 50) -> list[dict[str, Any]]:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT time, index_m3, index_liters, battery_v, valve_open,
                           trigger_label, raw_hex, f_cnt, f_port
                    FROM shengda_readings
                    WHERE tenant_id = %s::uuid AND dev_eui = %s
                    ORDER BY time DESC
                    LIMIT %s
                    """,
                    (tenant_id, dev_eui.lower(), limit),
                )
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]

    def insert_command(
        self,
        tenant_id: str,
        dev_eui: str,
        command_type: str,
        payload_hex: str,
        status: str = "pending",
    ) -> UUID:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO shengda_downlink_commands
                        (tenant_id, dev_eui, command_type, payload_hex, status)
                    VALUES (%s::uuid, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (tenant_id, dev_eui.lower(), command_type, payload_hex, status),
                )
                cmd_id = cur.fetchone()[0]
            conn.commit()
        return cmd_id

    def update_command_status(self, command_id: UUID, status: str, detail: str | None = None) -> None:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE shengda_downlink_commands
                    SET status = %s,
                        sent_at = CASE WHEN %s = 'sent' THEN NOW() ELSE sent_at END,
                        detail = COALESCE(%s, detail)
                    WHERE id = %s::uuid
                    """,
                    (status, status, detail, str(command_id)),
                )
            conn.commit()

    def list_commands(self, tenant_id: str, dev_eui: str, limit: int = 20) -> list[dict[str, Any]]:
        with psycopg.connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, command_type, payload_hex, status, created_at, sent_at, detail
                    FROM shengda_downlink_commands
                    WHERE tenant_id = %s::uuid AND dev_eui = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (tenant_id, dev_eui.lower(), limit),
                )
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
