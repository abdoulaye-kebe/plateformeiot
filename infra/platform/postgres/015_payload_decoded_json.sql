-- Objet décodé ChirpStack (champ MQTT "object") pour affichage Data Messages.
ALTER TABLE payload_archives
    ADD COLUMN IF NOT EXISTS decoded_json JSONB;

CREATE INDEX IF NOT EXISTS idx_payload_archives_decoded_json
    ON payload_archives ((decoded_json IS NOT NULL))
    WHERE decoded_json IS NOT NULL;
