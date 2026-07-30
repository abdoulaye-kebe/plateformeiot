-- Étendre les connecteurs au type MCP (client SSE vers serveur MCP externe)

ALTER TABLE tenant_connectors DROP CONSTRAINT IF EXISTS tenant_connectors_type_check;
ALTER TABLE tenant_connectors ADD CONSTRAINT tenant_connectors_type_check
    CHECK (type IN ('http', 'mqtt', 'mcp'));
