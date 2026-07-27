package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lorawan-platform/mqtt-ingestion/internal/ingest"
)

func NewPostgres(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}

type UplinkStore struct{ pool *pgxpool.Pool }

func NewUplinkStore(pool *pgxpool.Pool) *UplinkStore { return &UplinkStore{pool: pool} }

func (s *UplinkStore) InsertUplink(ctx context.Context, row ingest.UplinkRow) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO uplink_frames (time, tenant_id, dev_eui, application_id, gateway_id, rssi, snr, dr, f_cnt, f_port, frequency, payload_size, region)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`, row.Time, nullableUUID(row.TenantID), row.DevEUI, row.ApplicationID, row.GatewayID, row.RSSI, row.SNR, row.DR, row.FCnt, row.FPort, row.Frequency, row.PayloadSize, row.Region)
	return err
}

type GatewayStore struct{ pool *pgxpool.Pool }

func NewGatewayStore(pool *pgxpool.Pool) *GatewayStore { return &GatewayStore{pool: pool} }

func (s *GatewayStore) InsertStats(ctx context.Context, row ingest.GatewayRow) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO gateway_stats (time, tenant_id, gateway_id, rx_packets_received, tx_packets_received, region)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, row.Time, nullableUUID(row.TenantID), row.GatewayID, row.RXPacketsReceived, row.TXPacketsReceived, row.Region)
	return err
}

func nullableUUID(id *uuid.UUID) any {
	if id == nil {
		return nil
	}
	return *id
}
