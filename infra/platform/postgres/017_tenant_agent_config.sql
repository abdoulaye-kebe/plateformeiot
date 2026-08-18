-- Configuration agent IA par tenant + outils HTTP personnalisables

CREATE TABLE IF NOT EXISTS tenant_agent_config (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'Agent IA',
    system_prompt TEXT,
    welcome_message TEXT,
    suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
    enabled_builtin_tools JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_agent_custom_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    http_method TEXT NOT NULL DEFAULT 'GET',
    url_template TEXT NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    body_template TEXT,
    parameters JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenant_agent_custom_tools_name_chk CHECK (name ~ '^[a-z][a-z0-9_]{2,48}$'),
    CONSTRAINT tenant_agent_custom_tools_method_chk CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_agent_custom_tools_tenant ON tenant_agent_custom_tools(tenant_id);
