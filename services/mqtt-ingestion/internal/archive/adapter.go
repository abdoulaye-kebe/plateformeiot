package archive

import (
	"context"

	"github.com/lorawan-platform/mqtt-ingestion/internal/ingest"
	"github.com/lorawan-platform/mqtt-ingestion/internal/store"
)

type MinioPayloadArchiver struct {
	minio *Archiver
	db    *store.PayloadArchiveStore
}

func NewMinioPayloadArchiver(minio *Archiver, db *store.PayloadArchiveStore) *MinioPayloadArchiver {
	return &MinioPayloadArchiver{minio: minio, db: db}
}

func (a *MinioPayloadArchiver) ArchiveUplink(ctx context.Context, row ingest.UplinkRow, rawPayload []byte, payloadHex string, decodedObject []byte) error {
	result, err := a.minio.Store(ctx, ArchiveInput{
		Time:          row.Time,
		TenantID:      row.TenantID,
		DevEUI:        row.DevEUI,
		ApplicationID: row.ApplicationID,
		GatewayID:     row.GatewayID,
		PayloadHex:    payloadHex,
		PayloadSize:   row.PayloadSize,
		FPort:         row.FPort,
		FCnt:          row.FCnt,
		RawJSON:       rawPayload,
	})
	if err != nil {
		return err
	}
	return a.db.Insert(ctx, store.PayloadArchiveRow{
		Time:          row.Time,
		TenantID:      row.TenantID,
		DevEUI:        row.DevEUI,
		ApplicationID: row.ApplicationID,
		GatewayID:     row.GatewayID,
		ObjectKey:     result.ObjectKey,
		PayloadHex:    payloadHex,
		PayloadSize:   row.PayloadSize,
		FPort:         row.FPort,
		FCnt:          row.FCnt,
		DecodedJSON:   decodedObject,
	})
}
