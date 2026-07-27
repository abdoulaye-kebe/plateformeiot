package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrRuleNotFound = errors.New("rule not found")

type Rule struct {
	ID            uuid.UUID       `json:"id"`
	TenantID      *uuid.UUID      `json:"tenantId,omitempty"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	Enabled       bool            `json:"enabled"`
	TriggerType   string          `json:"triggerType"`
	ConditionJSON json.RawMessage `json:"condition"`
	ActionsJSON   json.RawMessage `json:"actions"`
	CreatedAt     time.Time       `json:"createdAt"`
}

type RuleStore struct{ pool *pgxpool.Pool }

func NewRuleStore(pool *pgxpool.Pool) *RuleStore { return &RuleStore{pool: pool} }

func (s *RuleStore) List(ctx context.Context, tenantID *uuid.UUID) ([]Rule, error) {
	if tenantID != nil {
		return s.scanRules(ctx, `
			SELECT id, tenant_id, name, description, enabled, trigger_type, condition_json, actions_json, created_at
			FROM rules WHERE tenant_id = $1 ORDER BY created_at DESC`, tenantID)
	}
	return s.scanRules(ctx, `
		SELECT id, tenant_id, name, description, enabled, trigger_type, condition_json, actions_json, created_at
		FROM rules ORDER BY created_at DESC`)
}

func (s *RuleStore) scanRules(ctx context.Context, query string, args ...any) ([]Rule, error) {
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rules []Rule
	for rows.Next() {
		var r Rule
		if err := rows.Scan(&r.ID, &r.TenantID, &r.Name, &r.Description, &r.Enabled, &r.TriggerType, &r.ConditionJSON, &r.ActionsJSON, &r.CreatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []Rule{}
	}
	return rules, rows.Err()
}

func (s *RuleStore) Create(ctx context.Context, tenantID *uuid.UUID, name, description, triggerType string, condition, actions json.RawMessage) (Rule, error) {
	var r Rule
	err := s.pool.QueryRow(ctx, `
		INSERT INTO rules (tenant_id, name, description, trigger_type, condition_json, actions_json)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, tenant_id, name, description, enabled, trigger_type, condition_json, actions_json, created_at
	`, tenantID, name, description, triggerType, condition, actions).Scan(
		&r.ID, &r.TenantID, &r.Name, &r.Description, &r.Enabled, &r.TriggerType, &r.ConditionJSON, &r.ActionsJSON, &r.CreatedAt,
	)
	return r, err
}

func (s *RuleStore) Delete(ctx context.Context, id uuid.UUID, tenantID *uuid.UUID) error {
	if tenantID != nil {
		tag, err := s.pool.Exec(ctx, `DELETE FROM rules WHERE id = $1 AND tenant_id = $2`, id, tenantID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrRuleNotFound
		}
		return nil
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM rules WHERE id = $1`, id)
	return err
}
