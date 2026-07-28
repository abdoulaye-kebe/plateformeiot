package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrRfScanRequestNotFound = errors.New("rf scan request not found")

type RfScanBin struct {
	FreqHz  int64   `json:"freqHz"`
	RssiDbm float64 `json:"rssiDbm"`
}

type RfScanPolluter struct {
	FreqHz   int64   `json:"freqHz"`
	RssiDbm  float64 `json:"rssiDbm"`
	Severity string  `json:"severity"`
}

type RfScanRequest struct {
	ID          uuid.UUID  `json:"id"`
	TenantID    uuid.UUID  `json:"tenantId"`
	GatewayID   string     `json:"gatewayId"`
	Status      string     `json:"status"`
	RequestedBy string     `json:"requestedBy,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	PickedAt    *time.Time `json:"pickedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

type RfScanResult struct {
	ID            uuid.UUID        `json:"id"`
	TenantID      uuid.UUID        `json:"tenantId"`
	GatewayID     string           `json:"gatewayId"`
	RequestID     *uuid.UUID       `json:"requestId,omitempty"`
	FreqStartHz   int64            `json:"freqStartHz"`
	ChannelStepHz int              `json:"channelStepHz"`
	Region        string           `json:"region"`
	Bins          []RfScanBin      `json:"bins"`
	Polluters     []RfScanPolluter `json:"polluters"`
	ScannedAt     time.Time        `json:"scannedAt"`
}

type RfScanStore struct{ pool *pgxpool.Pool }

func NewRfScanStore(pool *pgxpool.Pool) *RfScanStore { return &RfScanStore{pool: pool} }

func (s *RfScanStore) CreateRequest(ctx context.Context, tenantID uuid.UUID, gatewayID, requestedBy string) (*RfScanRequest, error) {
	var req RfScanRequest
	err := s.pool.QueryRow(ctx, `
		INSERT INTO gateway_rf_scan_requests (tenant_id, gateway_id, requested_by)
		VALUES ($1, $2, $3)
		RETURNING id, tenant_id, gateway_id, status, COALESCE(requested_by, ''), created_at, picked_at, completed_at
	`, tenantID, gatewayID, requestedBy).Scan(
		&req.ID, &req.TenantID, &req.GatewayID, &req.Status, &req.RequestedBy,
		&req.CreatedAt, &req.PickedAt, &req.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func (s *RfScanStore) PendingRequest(ctx context.Context, gatewayID string) (*RfScanRequest, error) {
	var req RfScanRequest
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, gateway_id, status, COALESCE(requested_by, ''), created_at, picked_at, completed_at
		FROM gateway_rf_scan_requests
		WHERE gateway_id = $1 AND status IN ('pending', 'running')
		ORDER BY created_at ASC
		LIMIT 1
	`, gatewayID).Scan(
		&req.ID, &req.TenantID, &req.GatewayID, &req.Status, &req.RequestedBy,
		&req.CreatedAt, &req.PickedAt, &req.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func (s *RfScanStore) MarkRequestRunning(ctx context.Context, requestID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE gateway_rf_scan_requests
		SET status = 'running', picked_at = COALESCE(picked_at, NOW())
		WHERE id = $1 AND status = 'pending'
	`, requestID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRfScanRequestNotFound
	}
	return nil
}

func (s *RfScanStore) SaveResult(ctx context.Context, tenantID uuid.UUID, gatewayID string, requestID *uuid.UUID,
	freqStart int64, stepHz int, region string, bins []RfScanBin, polluters []RfScanPolluter) (*RfScanResult, error) {
	binsJSON, err := json.Marshal(bins)
	if err != nil {
		return nil, err
	}
	pollutersJSON, err := json.Marshal(polluters)
	if err != nil {
		return nil, err
	}

	var result RfScanResult
	var binsRaw, pollutersRaw []byte
	err = s.pool.QueryRow(ctx, `
		INSERT INTO gateway_rf_scans (tenant_id, gateway_id, request_id, freq_start_hz, channel_step_hz, region, bins, polluters)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, tenant_id, gateway_id, request_id, freq_start_hz, channel_step_hz, COALESCE(region, ''), bins, polluters, scanned_at
	`, tenantID, gatewayID, requestID, freqStart, stepHz, region, binsJSON, pollutersJSON).Scan(
		&result.ID, &result.TenantID, &result.GatewayID, &result.RequestID,
		&result.FreqStartHz, &result.ChannelStepHz, &result.Region, &binsRaw, &pollutersRaw, &result.ScannedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(binsRaw, &result.Bins)
	_ = json.Unmarshal(pollutersRaw, &result.Polluters)

	if requestID != nil {
		_, _ = s.pool.Exec(ctx, `
			UPDATE gateway_rf_scan_requests SET status = 'completed', completed_at = NOW() WHERE id = $1
		`, *requestID)
	}
	return &result, nil
}

func (s *RfScanStore) Latest(ctx context.Context, gatewayID string) (*RfScanResult, error) {
	var result RfScanResult
	var binsRaw, pollutersRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, gateway_id, request_id, freq_start_hz, channel_step_hz, COALESCE(region, ''), bins, polluters, scanned_at
		FROM gateway_rf_scans WHERE gateway_id = $1 ORDER BY scanned_at DESC LIMIT 1
	`, gatewayID).Scan(
		&result.ID, &result.TenantID, &result.GatewayID, &result.RequestID,
		&result.FreqStartHz, &result.ChannelStepHz, &result.Region, &binsRaw, &pollutersRaw, &result.ScannedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(binsRaw, &result.Bins)
	_ = json.Unmarshal(pollutersRaw, &result.Polluters)
	return &result, nil
}

func (s *RfScanStore) List(ctx context.Context, gatewayID string, limit int) ([]RfScanResult, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, gateway_id, request_id, freq_start_hz, channel_step_hz, COALESCE(region, ''), bins, polluters, scanned_at
		FROM gateway_rf_scans WHERE gateway_id = $1 ORDER BY scanned_at DESC LIMIT $2
	`, gatewayID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RfScanResult
	for rows.Next() {
		var result RfScanResult
		var binsRaw, pollutersRaw []byte
		if err := rows.Scan(
			&result.ID, &result.TenantID, &result.GatewayID, &result.RequestID,
			&result.FreqStartHz, &result.ChannelStepHz, &result.Region, &binsRaw, &pollutersRaw, &result.ScannedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(binsRaw, &result.Bins)
		_ = json.Unmarshal(pollutersRaw, &result.Polluters)
		out = append(out, result)
	}
	if out == nil {
		out = []RfScanResult{}
	}
	return out, rows.Err()
}
