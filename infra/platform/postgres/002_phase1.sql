-- Phase 1 : métriques LoRaWAN + rule engine

CREATE TABLE IF NOT EXISTS uplink_frames (
    time TIMESTAMPTZ NOT NULL,
    dev_eui TEXT NOT NULL,
    application_id TEXT,
    gateway_id TEXT,
    rssi INT,
    snr DOUBLE PRECISION,
    dr INT,
    f_cnt BIGINT,
    f_port INT,
    frequency BIGINT,
    payload_size INT,
    region TEXT NOT NULL DEFAULT 'eu868'
);

SELECT create_hypertable('uplink_frames', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_uplink_dev_eui_time ON uplink_frames (dev_eui, time DESC);
CREATE INDEX IF NOT EXISTS idx_uplink_gateway_time ON uplink_frames (gateway_id, time DESC);

CREATE TABLE IF NOT EXISTS gateway_stats (
    time TIMESTAMPTZ NOT NULL,
    gateway_id TEXT NOT NULL,
    rx_packets_received BIGINT DEFAULT 0,
    tx_packets_received BIGINT DEFAULT 0,
    region TEXT NOT NULL DEFAULT 'eu868'
);

SELECT create_hypertable('gateway_stats', 'time', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_type TEXT NOT NULL DEFAULT 'uplink',
    condition_json JSONB NOT NULL DEFAULT '{}',
    actions_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_executions (
    id BIGSERIAL PRIMARY KEY,
    rule_id UUID REFERENCES rules(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_json JSONB NOT NULL,
    action_results JSONB NOT NULL DEFAULT '[]'
);

SELECT create_hypertable('rule_executions', 'matched_at', if_not_exists => TRUE);

-- Vue matérialisée trafic horaire
CREATE MATERIALIZED VIEW IF NOT EXISTS uplink_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    count(*)::bigint AS uplink_count,
    avg(rssi)::float AS avg_rssi,
    avg(snr)::float AS avg_snr,
    count(DISTINCT dev_eui)::bigint AS device_count
FROM uplink_frames
GROUP BY bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'uplink_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Règle exemple : alerte RSSI faible
INSERT INTO rules (name, description, trigger_type, condition_json, actions_json)
SELECT
    'RSSI critique',
    'Alerte si RSSI < -120 dBm',
    'uplink',
    '{"field":"rssi","op":"lt","value":-120}',
    '[{"type":"log","message":"RSSI critique détecté"}]'
WHERE NOT EXISTS (SELECT 1 FROM rules WHERE name = 'RSSI critique');
