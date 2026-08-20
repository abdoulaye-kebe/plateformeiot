package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type GatewayConnectivity struct {
	GatewayID                 string     `json:"gatewayId"`
	PreferredConnectivityMode string     `json:"preferredConnectivityMode"`
	VpnCertIssuedAt           *time.Time `json:"vpnCertIssuedAt,omitempty"`
	VpnCertRevokedAt          *time.Time `json:"vpnCertRevokedAt,omitempty"`
}

func (s *TenantResourceStore) GetGatewayConnectivity(ctx context.Context, gatewayID string) (*GatewayConnectivity, error) {
	var row GatewayConnectivity
	var issued, revoked *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT gateway_id, preferred_connectivity_mode, vpn_cert_issued_at, vpn_cert_revoked_at
		FROM tenant_gateways WHERE gateway_id = $1
	`, gatewayID).Scan(&row.GatewayID, &row.PreferredConnectivityMode, &issued, &revoked)
	if err != nil {
		return nil, err
	}
	row.VpnCertIssuedAt = issued
	row.VpnCertRevokedAt = revoked
	return &row, nil
}

func (s *TenantResourceStore) SetGatewayConnectivityMode(ctx context.Context, gatewayID string, mode string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tenant_gateways SET preferred_connectivity_mode = $2 WHERE gateway_id = $1
	`, gatewayID, mode)
	return err
}

func (s *TenantResourceStore) MarkVpnCertIssued(ctx context.Context, gatewayID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tenant_gateways
		SET vpn_cert_issued_at = NOW(), vpn_cert_revoked_at = NULL
		WHERE gateway_id = $1
	`, gatewayID)
	return err
}

func (s *TenantResourceStore) MarkVpnCertRevoked(ctx context.Context, gatewayID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tenant_gateways
		SET vpn_cert_revoked_at = NOW()
		WHERE gateway_id = $1
	`, gatewayID)
	return err
}

func (s *TenantResourceStore) LogConnectivityAudit(ctx context.Context, gatewayID string, tenantID uuid.UUID, action, detail string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO gateway_connectivity_audit (gateway_id, tenant_id, action, detail)
		VALUES ($1, $2, $3, $4)
	`, gatewayID, tenantID, action, detail)
	return err
}
