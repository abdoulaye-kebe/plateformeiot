CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Tenants SaaS (couche au-dessus de ChirpStack)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    chirpstack_tenant_id UUID,
    plan TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    chirpstack_application_id UUID,
    region TEXT NOT NULL DEFAULT 'eu868',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Événements plateforme (uplinks, alertes, billing)
CREATE TABLE platform_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('platform_events', 'occurred_at', if_not_exists => TRUE);

CREATE INDEX idx_platform_events_tenant ON platform_events (tenant_id, occurred_at DESC);

-- Phase 1 (inline pour nouvelles installs — voir aussi 002_phase1.sql)
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
