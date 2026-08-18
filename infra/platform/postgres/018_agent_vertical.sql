-- Profil agent par vertical (élevage, eau, générique)

ALTER TABLE tenant_agent_config
    ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'generic';

ALTER TABLE tenant_agent_config
    DROP CONSTRAINT IF EXISTS tenant_agent_config_vertical_chk;

ALTER TABLE tenant_agent_config
    ADD CONSTRAINT tenant_agent_config_vertical_chk
    CHECK (vertical IN ('generic', 'livestock', 'water'));

-- Tenants élevage / Saloum : agent bétail (pas Sen'eau)
INSERT INTO tenant_agent_config (tenant_id, display_name, welcome_message, suggestions, system_prompt, vertical, updated_at)
SELECT
    t.id,
    'Agent IA — Élevage',
    'Bonjour ! Je suis votre assistant IoT pour le suivi du bétail (colliers capteurs LoRaWAN). Je peux lister les devices, diagnostiquer le réseau (RSSI, SNR, gateways), repérer les animaux sans remontée récente et vous aider à provisionner devices et gateways.',
    '["Donne-moi une vue d''ensemble du réseau","Liste les devices (colliers)","Quels devices n''ont pas remonté depuis 24 h ?","Liste les gateways","Quel est le RSSI moyen du réseau ?"]'::jsonb,
    'Tu es l''agent IA LoRaWAN dédié au suivi du bétail (colliers GPS / capteurs santé). Tu disposes d''outils MCP pour le réseau : devices, gateways, métriques radio, events et diagnostics. Réponds en français, concis et actionnable. Ne parle pas de compteurs d''eau, vannes ou index m³.',
    'livestock',
    NOW()
FROM tenants t
WHERE t.status = 'active'
  AND (
    t.slug ILIKE '%eleveur%' OR t.slug ILIKE '%éleveur%' OR t.slug ILIKE '%saloum%'
    OR t.slug ILIKE '%betail%' OR t.slug ILIKE '%bétail%' OR t.slug ILIKE '%livestock%'
    OR t.name ILIKE '%eleveur%' OR t.name ILIKE '%éleveur%' OR t.name ILIKE '%saloum%'
    OR t.name ILIKE '%bétail%' OR t.name ILIKE '%betail%'
  )
ON CONFLICT (tenant_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    welcome_message = EXCLUDED.welcome_message,
    suggestions = EXCLUDED.suggestions,
    system_prompt = EXCLUDED.system_prompt,
    vertical = EXCLUDED.vertical,
    updated_at = NOW()
WHERE tenant_agent_config.vertical <> 'water';
