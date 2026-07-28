-- Activer l'Agent IA sur le plan Starter (visible dans la navigation)

UPDATE plans
SET features = '["analytics","rules","noc","agent"]'::jsonb
WHERE id = 'starter';
