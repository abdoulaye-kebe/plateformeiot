package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPlanNotFound = errors.New("plan not found")

type Plan struct {
	ID                  string          `json:"id"`
	Name                string          `json:"name"`
	MaxDevices          int             `json:"maxDevices"`
	MaxGateways         int             `json:"maxGateways"`
	MaxUplinksMonth     int64           `json:"maxUplinksMonth"`
	Features            json.RawMessage `json:"features"`
	PriceEURMonthly     *float64        `json:"priceEurMonthly,omitempty"`
	PriceEURYearly      *float64        `json:"priceEurYearly,omitempty"`
	StripePriceID       *string         `json:"stripePriceId,omitempty"`
	StripePriceIDYearly *string         `json:"stripePriceIdYearly,omitempty"`
	SortOrder           int             `json:"sortOrder"`
}

func (p *Plan) StripePriceForInterval(interval string) *string {
	if interval == "year" {
		return p.StripePriceIDYearly
	}
	return p.StripePriceID
}

func (p *Plan) PriceEURForInterval(interval string) *float64 {
	if interval == "year" {
		return p.PriceEURYearly
	}
	return p.PriceEURMonthly
}

type PlanStore struct{ pool *pgxpool.Pool }

func NewPlanStore(pool *pgxpool.Pool) *PlanStore { return &PlanStore{pool: pool} }

func (s *PlanStore) List(ctx context.Context) ([]Plan, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, max_devices, max_gateways, max_uplinks_month, features,
		       price_eur_monthly, price_eur_yearly, stripe_price_id, stripe_price_id_yearly, sort_order
		FROM plans ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Plan
	for rows.Next() {
		var p Plan
		if err := rows.Scan(&p.ID, &p.Name, &p.MaxDevices, &p.MaxGateways, &p.MaxUplinksMonth,
			&p.Features, &p.PriceEURMonthly, &p.PriceEURYearly, &p.StripePriceID, &p.StripePriceIDYearly, &p.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []Plan{}
	}
	return out, rows.Err()
}

func (s *PlanStore) Get(ctx context.Context, id string) (*Plan, error) {
	var p Plan
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, max_devices, max_gateways, max_uplinks_month, features,
		       price_eur_monthly, price_eur_yearly, stripe_price_id, stripe_price_id_yearly, sort_order
		FROM plans WHERE id = $1
	`, id).Scan(&p.ID, &p.Name, &p.MaxDevices, &p.MaxGateways, &p.MaxUplinksMonth,
		&p.Features, &p.PriceEURMonthly, &p.PriceEURYearly, &p.StripePriceID, &p.StripePriceIDYearly, &p.SortOrder)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPlanNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *PlanStore) HasFeature(plan *Plan, feature string) bool {
	if plan == nil {
		return false
	}
	var features []string
	if err := json.Unmarshal(plan.Features, &features); err != nil {
		return false
	}
	for _, f := range features {
		if f == feature || f == "*" {
			return true
		}
	}
	return false
}

type UsageQuota struct {
	Plan              Plan   `json:"plan"`
	UplinkCount       int64  `json:"uplinkCount"`
	DeviceCount       int64  `json:"deviceCount"`
	GatewayCount      int64  `json:"gatewayCount"`
	UplinksRemaining  int64  `json:"uplinksRemaining"`
	DevicesRemaining  int64  `json:"devicesRemaining"`
	GatewaysRemaining int64  `json:"gatewaysRemaining"`
	WithinLimits      bool   `json:"withinLimits"`
	SubscriptionStatus string `json:"subscriptionStatus"`
}

func (s *PlanStore) UsageQuota(ctx context.Context, tenantID uuid.UUID, planID string, billing *BillingStore, subscriptionStatus string) (*UsageQuota, error) {
	plan, err := s.Get(ctx, planID)
	if err != nil {
		plan, err = s.Get(ctx, "starter")
		if err != nil {
			return nil, err
		}
	}
	usage, err := billing.CurrentMonthUsage(ctx, &tenantID)
	if err != nil {
		return nil, err
	}
	q := &UsageQuota{
		Plan:               *plan,
		UplinkCount:        usage.UplinkCount,
		DeviceCount:        usage.ActiveDevices,
		GatewayCount:       usage.ActiveGateways,
		UplinksRemaining:   plan.MaxUplinksMonth - usage.UplinkCount,
		DevicesRemaining:   int64(plan.MaxDevices) - usage.ActiveDevices,
		GatewaysRemaining:  int64(plan.MaxGateways) - usage.ActiveGateways,
		SubscriptionStatus: subscriptionStatus,
	}
	q.WithinLimits = usage.UplinkCount <= plan.MaxUplinksMonth &&
		usage.ActiveDevices <= int64(plan.MaxDevices) &&
		usage.ActiveGateways <= int64(plan.MaxGateways)
	return q, nil
}
