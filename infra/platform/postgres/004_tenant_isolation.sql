-- Phase 3 : isolation multi-tenant production

-- Mapping ressources ChirpStack → tenant plateforme
CREATE TABLE IF NOT EXISTS tenant_applications (
    chirpstack_application_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_gateways (
    gateway_id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_applications_tenant ON tenant_applications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_gateways_tenant ON tenant_gateways (tenant_id);

-- Telemetry scopée tenant
ALTER TABLE uplink_frames ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE gateway_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE rule_executions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_uplink_tenant_time ON uplink_frames (tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_stats_tenant_time ON gateway_stats (tenant_id, time DESC);

-- Backfill tenant par défaut
DO $$
DECLARE
    default_tenant UUID;
BEGIN
    SELECT id INTO default_tenant FROM tenants WHERE slug = 'chirpstack-default' LIMIT 1;
    IF default_tenant IS NOT NULL THEN
        UPDATE uplink_frames SET tenant_id = default_tenant WHERE tenant_id IS NULL;
        UPDATE gateway_stats SET tenant_id = default_tenant WHERE tenant_id IS NULL;
        UPDATE rules SET tenant_id = default_tenant WHERE tenant_id IS NULL;
        UPDATE rule_executions re
        SET tenant_id = r.tenant_id
        FROM rules r
        WHERE re.rule_id = r.id AND re.tenant_id IS NULL AND r.tenant_id IS NOT NULL;

        INSERT INTO tenant_applications (chirpstack_application_id, tenant_id, name)
        SELECT 'bc0328f2-e02f-4ef0-b214-375a6fb13ccb'::uuid, default_tenant, 'sensors'
        WHERE NOT EXISTS (
            SELECT 1 FROM tenant_applications WHERE chirpstack_application_id = 'bc0328f2-e02f-4ef0-b214-375a6fb13ccb'::uuid
        );

        INSERT INTO tenant_gateways (gateway_id, tenant_id)
        SELECT gw, default_tenant FROM unnest(ARRAY['aabbccdd00112233', 'aabbccdd00112234']) AS gw
        ON CONFLICT (gateway_id) DO NOTHING;
    END IF;
END $$;
