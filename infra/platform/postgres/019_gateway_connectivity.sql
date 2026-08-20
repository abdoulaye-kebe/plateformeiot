-- Connectivité gateway : modes Semtech UDP, Basic Station, OpenVPN

ALTER TABLE tenant_gateways
    ADD COLUMN IF NOT EXISTS preferred_connectivity_mode TEXT NOT NULL DEFAULT 'semtech_udp';

ALTER TABLE tenant_gateways
    DROP CONSTRAINT IF EXISTS tenant_gateways_connectivity_mode_chk;

ALTER TABLE tenant_gateways
    ADD CONSTRAINT tenant_gateways_connectivity_mode_chk
    CHECK (preferred_connectivity_mode IN ('semtech_udp', 'basic_station', 'openvpn'));

ALTER TABLE tenant_gateways
    ADD COLUMN IF NOT EXISTS vpn_cert_issued_at TIMESTAMPTZ;

ALTER TABLE tenant_gateways
    ADD COLUMN IF NOT EXISTS vpn_cert_revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS gateway_connectivity_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_id TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_connectivity_audit_gw
    ON gateway_connectivity_audit (gateway_id, created_at DESC);
