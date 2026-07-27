package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PayloadArchiveRow struct {
	Time          time.Time
	TenantID      *uuid.UUID
	DevEUI        string
	ApplicationID string
	GatewayID     string
	ObjectKey     string
	PayloadHex    string
	PayloadSize   int
	FPort         int
	FCnt          int64
}

type PayloadArchiveStore struct{ pool *pgxpool.Pool }

func NewPayloadArchiveStore(pool *pgxpool.Pool) *PayloadArchiveStore {
	return &PayloadArchiveStore{pool: pool}
}

func (s *PayloadArchiveStore) Insert(ctx context.Context, row PayloadArchiveRow) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO payload_archives (time, tenant_id, dev_eui, application_id, gateway_id, object_key, payload_hex, payload_size, f_port, f_cnt)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`, row.Time, nullableUUID(row.TenantID), row.DevEUI, row.ApplicationID, row.GatewayID,
		row.ObjectKey, row.PayloadHex, row.PayloadSize, row.FPort, row.FCnt)
	return err
}
