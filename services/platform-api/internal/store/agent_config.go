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

var ErrAgentCustomToolNotFound = errors.New("agent custom tool not found")

const defaultWelcomeMessage = "Bonjour ! Je suis votre assistant IoT LoRaWAN. Posez-moi des questions sur le réseau, les devices, les gateways ou vos outils métier configurés."

var DefaultAgentSuggestions = []string{
	"Donne-moi une vue d'ensemble du réseau",
	"Liste les devices",
	"Liste les gateways",
}

type AgentConfig struct {
	TenantID            uuid.UUID       `json:"tenantId"`
	DisplayName         string          `json:"displayName"`
	SystemPrompt        *string         `json:"systemPrompt,omitempty"`
	WelcomeMessage      *string         `json:"welcomeMessage,omitempty"`
	Suggestions         json.RawMessage `json:"suggestions"`
	EnabledBuiltinTools json.RawMessage `json:"enabledBuiltinTools,omitempty"`
	UpdatedAt           time.Time       `json:"updatedAt"`
}

type AgentCustomTool struct {
	ID           uuid.UUID       `json:"id"`
	TenantID     uuid.UUID       `json:"tenantId"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	HTTPMethod   string          `json:"httpMethod"`
	URLTemplate  string          `json:"urlTemplate"`
	Headers      json.RawMessage `json:"headers"`
	BodyTemplate *string         `json:"bodyTemplate,omitempty"`
	Parameters   json.RawMessage `json:"parameters"`
	Enabled      bool            `json:"enabled"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}

type AgentResolvedConfig struct {
	DisplayName         string            `json:"displayName"`
	SystemPrompt        string            `json:"systemPrompt"`
	WelcomeMessage      string            `json:"welcomeMessage"`
	Suggestions         []string          `json:"suggestions"`
	EnabledBuiltinTools []string          `json:"enabledBuiltinTools,omitempty"`
	CustomTools         []AgentCustomTool `json:"customTools"`
}

type AgentConfigStore struct {
	pool *pgxpool.Pool
}

func NewAgentConfigStore(pool *pgxpool.Pool) *AgentConfigStore {
	return &AgentConfigStore{pool: pool}
}

func (s *AgentConfigStore) GetOrCreate(ctx context.Context, tenantID uuid.UUID) (AgentConfig, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT tenant_id, display_name, system_prompt, welcome_message, suggestions, enabled_builtin_tools, updated_at
		FROM tenant_agent_config WHERE tenant_id = $1
	`, tenantID)
	cfg, err := scanAgentConfig(row)
	if err == nil {
		return cfg, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return AgentConfig{}, err
	}
	suggestions, _ := json.Marshal(DefaultAgentSuggestions)
	row = s.pool.QueryRow(ctx, `
		INSERT INTO tenant_agent_config (tenant_id, display_name, welcome_message, suggestions)
		VALUES ($1, 'Agent IA', $2, $3)
		RETURNING tenant_id, display_name, system_prompt, welcome_message, suggestions, enabled_builtin_tools, updated_at
	`, tenantID, defaultWelcomeMessage, suggestions)
	return scanAgentConfig(row)
}

func (s *AgentConfigStore) Update(ctx context.Context, tenantID uuid.UUID, displayName string, systemPrompt, welcomeMessage *string, suggestions json.RawMessage, enabledBuiltinTools json.RawMessage) (AgentConfig, error) {
	if suggestions == nil {
		suggestions = json.RawMessage(`[]`)
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tenant_agent_config (tenant_id, display_name, system_prompt, welcome_message, suggestions, enabled_builtin_tools, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (tenant_id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			system_prompt = EXCLUDED.system_prompt,
			welcome_message = EXCLUDED.welcome_message,
			suggestions = EXCLUDED.suggestions,
			enabled_builtin_tools = EXCLUDED.enabled_builtin_tools,
			updated_at = NOW()
		RETURNING tenant_id, display_name, system_prompt, welcome_message, suggestions, enabled_builtin_tools, updated_at
	`, tenantID, displayName, systemPrompt, welcomeMessage, suggestions, enabledBuiltinTools)
	return scanAgentConfig(row)
}

func (s *AgentConfigStore) ListCustomTools(ctx context.Context, tenantID uuid.UUID) ([]AgentCustomTool, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, description, http_method, url_template, headers, body_template, parameters, enabled, created_at, updated_at
		FROM tenant_agent_custom_tools
		WHERE tenant_id = $1
		ORDER BY name ASC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []AgentCustomTool
	for rows.Next() {
		t, err := scanAgentCustomTool(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	if list == nil {
		list = []AgentCustomTool{}
	}
	return list, rows.Err()
}

func (s *AgentConfigStore) CreateCustomTool(ctx context.Context, tenantID uuid.UUID, name, description, method, urlTemplate string, headers, parameters json.RawMessage, bodyTemplate *string, enabled bool) (AgentCustomTool, error) {
	if headers == nil {
		headers = json.RawMessage(`{}`)
	}
	if parameters == nil {
		parameters = json.RawMessage(`{"type":"object","properties":{}}`)
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tenant_agent_custom_tools (tenant_id, name, description, http_method, url_template, headers, body_template, parameters, enabled)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, tenant_id, name, description, http_method, url_template, headers, body_template, parameters, enabled, created_at, updated_at
	`, tenantID, name, description, method, urlTemplate, headers, bodyTemplate, parameters, enabled)
	return scanAgentCustomToolRow(row)
}

func (s *AgentConfigStore) UpdateCustomTool(ctx context.Context, id, tenantID uuid.UUID, name, description, method, urlTemplate string, headers, parameters json.RawMessage, bodyTemplate *string, enabled bool) (AgentCustomTool, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE tenant_agent_custom_tools
		SET name = $3, description = $4, http_method = $5, url_template = $6, headers = $7,
		    body_template = $8, parameters = $9, enabled = $10, updated_at = NOW()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, description, http_method, url_template, headers, body_template, parameters, enabled, created_at, updated_at
	`, id, tenantID, name, description, method, urlTemplate, headers, bodyTemplate, parameters, enabled)
	t, err := scanAgentCustomToolRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return AgentCustomTool{}, ErrAgentCustomToolNotFound
	}
	return t, err
}

func (s *AgentConfigStore) DeleteCustomTool(ctx context.Context, id, tenantID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tenant_agent_custom_tools WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAgentCustomToolNotFound
	}
	return nil
}

func (s *AgentConfigStore) Resolve(ctx context.Context, tenantID uuid.UUID, defaultSystemPrompt string) (AgentResolvedConfig, error) {
	cfg, err := s.GetOrCreate(ctx, tenantID)
	if err != nil {
		return AgentResolvedConfig{}, err
	}
	tools, err := s.ListCustomTools(ctx, tenantID)
	if err != nil {
		return AgentResolvedConfig{}, err
	}
	enabledCustom := make([]AgentCustomTool, 0, len(tools))
	for _, t := range tools {
		if t.Enabled {
			enabledCustom = append(enabledCustom, t)
		}
	}
	systemPrompt := defaultSystemPrompt
	if cfg.SystemPrompt != nil && *cfg.SystemPrompt != "" {
		systemPrompt = *cfg.SystemPrompt
	}
	welcome := defaultWelcomeMessage
	if cfg.WelcomeMessage != nil && *cfg.WelcomeMessage != "" {
		welcome = *cfg.WelcomeMessage
	}
	var suggestions []string
	_ = json.Unmarshal(cfg.Suggestions, &suggestions)
	if len(suggestions) == 0 {
		suggestions = DefaultAgentSuggestions
	}
	var enabledBuiltin []string
	if cfg.EnabledBuiltinTools != nil && len(cfg.EnabledBuiltinTools) > 0 && string(cfg.EnabledBuiltinTools) != "null" {
		_ = json.Unmarshal(cfg.EnabledBuiltinTools, &enabledBuiltin)
	}
	return AgentResolvedConfig{
		DisplayName:         cfg.DisplayName,
		SystemPrompt:        systemPrompt,
		WelcomeMessage:      welcome,
		Suggestions:         suggestions,
		EnabledBuiltinTools: enabledBuiltin,
		CustomTools:         enabledCustom,
	}, nil
}

func scanAgentConfig(row pgx.Row) (AgentConfig, error) {
	var c AgentConfig
	err := row.Scan(&c.TenantID, &c.DisplayName, &c.SystemPrompt, &c.WelcomeMessage, &c.Suggestions, &c.EnabledBuiltinTools, &c.UpdatedAt)
	return c, err
}

func scanAgentCustomTool(row pgx.Rows) (AgentCustomTool, error) {
	var t AgentCustomTool
	err := row.Scan(&t.ID, &t.TenantID, &t.Name, &t.Description, &t.HTTPMethod, &t.URLTemplate, &t.Headers, &t.BodyTemplate, &t.Parameters, &t.Enabled, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func scanAgentCustomToolRow(row pgx.Row) (AgentCustomTool, error) {
	var t AgentCustomTool
	err := row.Scan(&t.ID, &t.TenantID, &t.Name, &t.Description, &t.HTTPMethod, &t.URLTemplate, &t.Headers, &t.BodyTemplate, &t.Parameters, &t.Enabled, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}
