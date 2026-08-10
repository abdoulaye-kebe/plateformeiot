-- Détection de fuites d'eau — événements et paramètres tenant

CREATE TABLE IF NOT EXISTS water_leak_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    flow_threshold_m3h NUMERIC(10, 4) NOT NULL DEFAULT 0.05,
    night_flow_threshold_m3h NUMERIC(10, 4) NOT NULL DEFAULT 0.02,
    night_start_hour SMALLINT NOT NULL DEFAULT 22,
    night_end_hour SMALLINT NOT NULL DEFAULT 6,
    min_interval_minutes SMALLINT NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_leak_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dev_eui TEXT NOT NULL,
    leak_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_positive')),
    title TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    flow_m3h NUMERIC(10, 4),
    index_m3 NUMERIC(14, 3),
    valve_open BOOLEAN,
    reading_time TIMESTAMPTZ,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_water_leak_events_tenant_time
    ON water_leak_events(tenant_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_water_leak_events_active
    ON water_leak_events(tenant_id, status, detected_at DESC)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_water_leak_events_dev
    ON water_leak_events(tenant_id, dev_eui, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_leak_events_active_unique
    ON water_leak_events(tenant_id, dev_eui, leak_type)
    WHERE status = 'active';

ALTER TABLE shengda_readings
    ADD COLUMN IF NOT EXISTS flow_m3h NUMERIC(10, 4);
