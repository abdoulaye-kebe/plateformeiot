-- Multi-protocole : devices MQTT / LwM2M (LTE-M, IP)

CREATE TABLE IF NOT EXISTS device_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (protocol IN ('mqtt', 'lwm2m')),
    external_id TEXT NOT NULL,
    credentials JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, protocol, external_id)
);
CREATE INDEX IF NOT EXISTS idx_device_endpoints_tenant ON device_endpoints (tenant_id, protocol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_endpoints_external ON device_endpoints (protocol, external_id);

CREATE TABLE IF NOT EXISTS telemetry_messages (
    id BIGSERIAL,
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    device_endpoint_id UUID REFERENCES device_endpoints(id) ON DELETE SET NULL,
    protocol TEXT NOT NULL,
    external_id TEXT NOT NULL,
    payload_json JSONB,
    payload_raw TEXT,
    payload_size INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (time, id)
);
SELECT create_hypertable('telemetry_messages', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant ON telemetry_messages (tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry_messages (device_endpoint_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_external ON telemetry_messages (protocol, external_id, time DESC);

ALTER TABLE payload_archives ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE payload_archives ADD COLUMN IF NOT EXISTS device_endpoint_id UUID REFERENCES device_endpoints(id) ON DELETE SET NULL;
ALTER TABLE payload_archives ADD COLUMN IF NOT EXISTS external_id TEXT;
