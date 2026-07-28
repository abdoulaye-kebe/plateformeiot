-- Catalogue plans + licensing SaaS

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_devices INT NOT NULL,
    max_gateways INT NOT NULL,
    max_uplinks_month BIGINT NOT NULL,
    features JSONB NOT NULL DEFAULT '[]',
    price_eur_monthly NUMERIC(10, 2),
    price_eur_yearly NUMERIC(10, 2),
    stripe_price_id TEXT,
    stripe_price_id_yearly TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name, max_devices, max_gateways, max_uplinks_month, features, price_eur_monthly, price_eur_yearly, sort_order)
VALUES
    ('starter', 'Starter', 50, 5, 100000, '["analytics","rules","noc","agent"]', 49.00, 490.00, 1),
    ('pro', 'Pro', 500, 50, 1000000, '["analytics","rules","noc","fuota","anomalies","agent"]', 199.00, 1990.00, 2),
    ('enterprise', 'Enterprise', 10000, 500, 100000000, '["analytics","rules","noc","fuota","anomalies","agent","api_keys","priority_support"]', 999.00, 9990.00, 3)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    max_devices = EXCLUDED.max_devices,
    max_gateways = EXCLUDED.max_gateways,
    max_uplinks_month = EXCLUDED.max_uplinks_month,
    features = EXCLUDED.features,
    price_eur_monthly = EXCLUDED.price_eur_monthly,
    price_eur_yearly = EXCLUDED.price_eur_yearly,
    sort_order = EXCLUDED.sort_order;

-- Normaliser plans tenants existants
UPDATE tenants SET plan = 'starter' WHERE plan IS NULL OR plan = '';
UPDATE tenants SET plan = 'pro' WHERE plan IN ('operator', 'business');
UPDATE tenants SET plan = 'enterprise' WHERE plan = 'enterprise';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
