-- Phase 2 : IAM multi-tenant + billing metering

CREATE TABLE IF NOT EXISTS tenant_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    keycloak_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, keycloak_user_id)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    prefix TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{read}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS billing_usage_daily (
    day DATE NOT NULL,
    tenant_id UUID,
    uplink_count BIGINT NOT NULL DEFAULT 0,
    device_count BIGINT NOT NULL DEFAULT 0,
    gateway_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_rule_executions_recent ON rule_executions (matched_at DESC);

-- Tenant par défaut lié au tenant ChirpStack
INSERT INTO tenants (name, slug, chirpstack_tenant_id, plan)
SELECT 'ChirpStack Default', 'chirpstack-default', 'a9307558-82d4-4dbc-9ebc-daf565804305'::uuid, 'operator'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'chirpstack-default');
