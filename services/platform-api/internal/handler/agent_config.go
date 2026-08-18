package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

const defaultAgentSystemPrompt = store.DefaultGenericAgentSystemPrompt

var customToolNameRe = regexp.MustCompile(`^[a-z][a-z0-9_]{2,48}$`)

func (d Deps) requireAgentAdmin(w http.ResponseWriter, r *http.Request) (*uuid.UUID, bool) {
	if !d.withFeatureOrAdmin(w, r, "agent") {
		return nil, false
	}
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return nil, false
	}
	if !hasAnyRole(user, "platform-admin", "tenant-admin") {
		writeError(w, http.StatusForbidden, "tenant-admin required")
		return nil, false
	}
	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant scope required")
		return nil, false
	}
	return tid, true
}

func (d Deps) getAgentConfig(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "agent") {
		return
	}
	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant scope required")
		return
	}
	cfg, err := d.AgentConfig.GetOrCreate(r.Context(), *tid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools, err := d.AgentConfig.ListCustomTools(r.Context(), *tid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	available := d.fetchAllBuiltinToolNames(r)
	var enabled []string
	if cfg.EnabledBuiltinTools != nil && len(cfg.EnabledBuiltinTools) > 0 && string(cfg.EnabledBuiltinTools) != "null" {
		_ = json.Unmarshal(cfg.EnabledBuiltinTools, &enabled)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"config":                cfg,
		"customTools":           tools,
		"availableBuiltinTools": available,
		"enabledBuiltinTools":   enabled,
	})
}

func (d Deps) fetchAllBuiltinToolNames(r *http.Request) []string {
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, agentBaseURL()+"/api/v1/tools", nil)
	if err != nil {
		return []string{}
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return []string{}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out struct {
		Tools []struct {
			Name string `json:"name"`
		} `json:"tools"`
	}
	if json.Unmarshal(raw, &out) != nil {
		return []string{}
	}
	names := make([]string, 0, len(out.Tools))
	for _, t := range out.Tools {
		if t.Name != "" {
			names = append(names, t.Name)
		}
	}
	return names
}

func (d Deps) putAgentConfig(w http.ResponseWriter, r *http.Request) {
	tid, ok := d.requireAgentAdmin(w, r)
	if !ok {
		return
	}
	var req struct {
		DisplayName         string          `json:"displayName"`
		SystemPrompt        *string         `json:"systemPrompt"`
		WelcomeMessage      *string         `json:"welcomeMessage"`
		Suggestions         json.RawMessage `json:"suggestions"`
		EnabledBuiltinTools json.RawMessage `json:"enabledBuiltinTools"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if strings.TrimSpace(req.DisplayName) == "" {
		req.DisplayName = "Agent IA"
	}
	cfg, err := d.AgentConfig.Update(r.Context(), *tid, req.DisplayName, req.SystemPrompt, req.WelcomeMessage, req.Suggestions, req.EnabledBuiltinTools)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (d Deps) createAgentCustomTool(w http.ResponseWriter, r *http.Request) {
	tid, ok := d.requireAgentAdmin(w, r)
	if !ok {
		return
	}
	var req struct {
		Name         string          `json:"name"`
		Description  string          `json:"description"`
		HTTPMethod   string          `json:"httpMethod"`
		URLTemplate  string          `json:"urlTemplate"`
		Headers      json.RawMessage `json:"headers"`
		BodyTemplate *string         `json:"bodyTemplate"`
		Parameters   json.RawMessage `json:"parameters"`
		Enabled      *bool           `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := validateCustomToolInput(req.Name, req.Description, req.HTTPMethod, req.URLTemplate); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	tool, err := d.AgentConfig.CreateCustomTool(r.Context(), *tid, req.Name, req.Description, req.HTTPMethod, req.URLTemplate, req.Headers, req.Parameters, req.BodyTemplate, enabled)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, tool)
}

func (d Deps) updateAgentCustomTool(w http.ResponseWriter, r *http.Request) {
	tid, ok := d.requireAgentAdmin(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name         string          `json:"name"`
		Description  string          `json:"description"`
		HTTPMethod   string          `json:"httpMethod"`
		URLTemplate  string          `json:"urlTemplate"`
		Headers      json.RawMessage `json:"headers"`
		BodyTemplate *string         `json:"bodyTemplate"`
		Parameters   json.RawMessage `json:"parameters"`
		Enabled      bool            `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := validateCustomToolInput(req.Name, req.Description, req.HTTPMethod, req.URLTemplate); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	tool, err := d.AgentConfig.UpdateCustomTool(r.Context(), id, *tid, req.Name, req.Description, req.HTTPMethod, req.URLTemplate, req.Headers, req.Parameters, req.BodyTemplate, req.Enabled)
	if err != nil {
		if err == store.ErrAgentCustomToolNotFound {
			writeError(w, http.StatusNotFound, "tool not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tool)
}

func (d Deps) deleteAgentCustomTool(w http.ResponseWriter, r *http.Request) {
	tid, ok := d.requireAgentAdmin(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := d.AgentConfig.DeleteCustomTool(r.Context(), id, *tid); err != nil {
		if err == store.ErrAgentCustomToolNotFound {
			writeError(w, http.StatusNotFound, "tool not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) resolveAgentConfigForTenant(ctx context.Context, tenantID uuid.UUID) (store.AgentResolvedConfig, error) {
	return d.AgentConfig.Resolve(ctx, tenantID, defaultAgentSystemPrompt)
}

func validateCustomToolInput(name, description, method, urlTemplate string) error {
	name = strings.TrimSpace(name)
	if !customToolNameRe.MatchString(name) {
		return errValidation("name must be snake_case (a-z, 0-9, _, 3-49 chars)")
	}
	if strings.TrimSpace(description) == "" {
		return errValidation("description required")
	}
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "GET"
	}
	switch method {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
	default:
		return errValidation("httpMethod must be GET, POST, PUT, PATCH or DELETE")
	}
	if strings.TrimSpace(urlTemplate) == "" {
		return errValidation("urlTemplate required")
	}
	if !strings.HasPrefix(urlTemplate, "http://") && !strings.HasPrefix(urlTemplate, "https://") {
		return errValidation("urlTemplate must start with http:// or https://")
	}
	return nil
}

type validationError string

func (e validationError) Error() string { return string(e) }

func errValidation(msg string) error { return validationError(msg) }
