-- Connecteurs sortants par tenant (HTTP webhook + MQTT/MQTTS)

CREATE TABLE IF NOT EXISTS tenant_connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('http', 'mqtt')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    events TEXT[] NOT NULL DEFAULT ARRAY['uplink'],
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_connectors_active
    ON tenant_connectors (tenant_id)
    WHERE enabled = true;

-- Feature intégrations sur plans operator, enterprise et starter
UPDATE plans
SET features = (
    SELECT jsonb_agg(DISTINCT elem)
    FROM (
        SELECT jsonb_array_elements_text(features) AS elem
        UNION ALL SELECT 'integrations'
    ) s
)
WHERE id IN ('starter', 'operator', 'enterprise')
  AND NOT features @> '["integrations"]'::jsonb;
