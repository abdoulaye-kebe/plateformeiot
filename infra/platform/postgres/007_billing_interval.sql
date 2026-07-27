-- Facturation mensuelle + annuelle

ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_eur_yearly NUMERIC(10, 2);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT;

UPDATE plans SET price_eur_yearly = 490.00 WHERE id = 'starter' AND price_eur_yearly IS NULL;
UPDATE plans SET price_eur_yearly = 1990.00 WHERE id = 'pro' AND price_eur_yearly IS NULL;
UPDATE plans SET price_eur_yearly = 9990.00 WHERE id = 'enterprise' AND price_eur_yearly IS NULL;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'month';
