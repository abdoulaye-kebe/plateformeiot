-- Application métier Shengda — compteurs d'eau et commandes vanne

CREATE TABLE IF NOT EXISTS shengda_meters (
    dev_eui TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    application_id TEXT,
    name TEXT,
    meter_number BIGINT,
    meter_type SMALLINT,
    pulse_constant SMALLINT,
    last_index_m3 NUMERIC(14, 3),
    last_index_liters BIGINT,
    valve_open BOOLEAN,
    valve_fault BOOLEAN,
    battery_v NUMERIC(6, 2),
    status_word_1 SMALLINT,
    status_word_2 SMALLINT,
    magnetic_attack BOOLEAN,
    battery_low BOOLEAN,
    last_reading_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shengda_meters_tenant ON shengda_meters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shengda_meters_last_reading ON shengda_meters(tenant_id, last_reading_at DESC);

CREATE TABLE IF NOT EXISTS shengda_readings (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id UUID NOT NULL,
    dev_eui TEXT NOT NULL,
    index_m3 NUMERIC(14, 3),
    index_liters BIGINT,
    pulse_count BIGINT,
    battery_v NUMERIC(6, 2),
    valve_open BOOLEAN,
    valve_fault BOOLEAN,
    battery_low BOOLEAN,
    magnetic_attack BOOLEAN,
    trigger_source SMALLINT,
    trigger_label TEXT,
    status_word_1 SMALLINT,
    status_word_2 SMALLINT,
    packet_sequence SMALLINT,
    raw_hex TEXT,
    f_cnt BIGINT,
    f_port SMALLINT,
    decoded JSONB,
    PRIMARY KEY (time, id)
);

SELECT create_hypertable('shengda_readings', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_shengda_readings_dev ON shengda_readings(tenant_id, dev_eui, time DESC);

CREATE TABLE IF NOT EXISTS shengda_downlink_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dev_eui TEXT NOT NULL,
    command_type TEXT NOT NULL,
    payload_hex TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    ack_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shengda_commands_dev ON shengda_downlink_commands(tenant_id, dev_eui, created_at DESC);
