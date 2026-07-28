-- Scan RF bande ISM (gateways compatibles Corecell / SX1261)

CREATE TABLE IF NOT EXISTS gateway_rf_scan_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gateway_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    picked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rf_scan_requests_gateway_status
    ON gateway_rf_scan_requests (gateway_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS gateway_rf_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gateway_id TEXT NOT NULL,
    request_id UUID REFERENCES gateway_rf_scan_requests(id) ON DELETE SET NULL,
    freq_start_hz BIGINT NOT NULL,
    channel_step_hz INT NOT NULL DEFAULT 200000,
    region TEXT DEFAULT 'EU868',
    bins JSONB NOT NULL,
    polluters JSONB NOT NULL DEFAULT '[]',
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_rf_scans_gateway_time
    ON gateway_rf_scans (gateway_id, scanned_at DESC);
