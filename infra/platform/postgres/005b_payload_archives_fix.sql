-- Fix payload_archives pour TimescaleDB (PK composite time+id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'payload_archives'
  ) AND NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'payload_archives'
  ) THEN
    ALTER TABLE payload_archives DROP CONSTRAINT IF EXISTS payload_archives_pkey;
    ALTER TABLE payload_archives ADD PRIMARY KEY (time, id);
    PERFORM create_hypertable('payload_archives', 'time', if_not_exists => TRUE);
  END IF;
END $$;
