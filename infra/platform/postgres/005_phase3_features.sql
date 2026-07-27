-- Phase 3 : archivage payloads, anomalies ML, FUOTA, Stripe

CREATE TABLE IF NOT EXISTS payload_archives (
    id BIGSERIAL,
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    dev_eui TEXT NOT NULL,
    application_id TEXT,
    gateway_id TEXT,
    object_key TEXT NOT NULL,
    payload_hex TEXT,
    payload_size INT NOT NULL DEFAULT 0,
    f_port INT,
    f_cnt BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (time, id)
);
SELECT create_hypertable('payload_archives', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_payload_archives_dev ON payload_archives (dev_eui, time DESC);
CREATE INDEX IF NOT EXISTS idx_payload_archives_tenant ON payload_archives (tenant_id, time DESC);

CREATE TABLE IF NOT EXISTS anomaly_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    anomaly_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    dev_eui TEXT,
    gateway_id TEXT,
    title TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_tenant_open ON anomaly_events (tenant_id, detected_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_anomaly_dev ON anomaly_events (dev_eui, anomaly_type, detected_at DESC);

CREATE TABLE IF NOT EXISTS fuota_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    application_id TEXT NOT NULL,
    multicast_group_id TEXT,
    firmware_object_key TEXT,
    firmware_size BIGINT DEFAULT 0,
    device_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fuota_tenant ON fuota_deployments (tenant_id, created_at DESC);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_email TEXT;
