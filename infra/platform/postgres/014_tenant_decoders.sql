-- Décodeurs JavaScript ChirpStack par tenant (admin)

CREATE TABLE IF NOT EXISTS tenant_decoders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL DEFAULT '',
    script TEXT NOT NULL,
    downlink_f_port INT NOT NULL DEFAULT 1,
    device_profile_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_decoders_tenant
    ON tenant_decoders (tenant_id, updated_at DESC);
