package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func agentBaseURL() string {
	if u := os.Getenv("AGENT_HTTP_URL"); u != "" {
		return u
	}
	return "http://ai-agent:8096"
}

type agentChatRequest struct {
	Message string `json:"message"`
}

type agentTenantConfigPayload struct {
	DisplayName         string                   `json:"displayName"`
	SystemPrompt        string                   `json:"systemPrompt"`
	WelcomeMessage      string                   `json:"welcomeMessage"`
	Suggestions         []string                 `json:"suggestions"`
	EnabledBuiltinTools []string                 `json:"enabledBuiltinTools,omitempty"`
	CustomTools         []storeAgentCustomTool   `json:"customTools"`
}

type storeAgentCustomTool struct {
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	HTTPMethod   string          `json:"httpMethod"`
	URLTemplate  string          `json:"urlTemplate"`
	Headers      json.RawMessage `json:"headers"`
	BodyTemplate *string         `json:"bodyTemplate,omitempty"`
	Parameters   json.RawMessage `json:"parameters"`
}

type agentChatProxyRequest struct {
	Message      string                    `json:"message"`
	TenantConfig *agentTenantConfigPayload `json:"tenantConfig,omitempty"`
}

type agentChatResponse struct {
	Answer   string `json:"answer"`
	Provider string `json:"provider"`
	Form     string `json:"form,omitempty"`
}

func (d Deps) agentChat(w http.ResponseWriter, r *http.Request) {
	var req agentChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		writeError(w, http.StatusBadRequest, "message required")
		return
	}

	proxy := agentChatProxyRequest{Message: req.Message}
	if tid, ok := d.platformTenantID(r.Context(), r); ok && d.AgentConfig != nil {
		if resolved, err := d.resolveAgentConfigForTenant(r.Context(), *tid); err == nil {
			custom := make([]storeAgentCustomTool, 0, len(resolved.CustomTools))
			for _, t := range resolved.CustomTools {
				custom = append(custom, storeAgentCustomTool{
					Name:         t.Name,
					Description:  t.Description,
					HTTPMethod:   t.HTTPMethod,
					URLTemplate:  t.URLTemplate,
					Headers:      t.Headers,
					BodyTemplate: t.BodyTemplate,
					Parameters:   t.Parameters,
				})
			}
			proxy.TenantConfig = &agentTenantConfigPayload{
				DisplayName:         resolved.DisplayName,
				SystemPrompt:        resolved.SystemPrompt,
				WelcomeMessage:      resolved.WelcomeMessage,
				Suggestions:         resolved.Suggestions,
				EnabledBuiltinTools: resolved.EnabledBuiltinTools,
				CustomTools:         custom,
			}
		}
	}

	body, _ := json.Marshal(proxy)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, agentBaseURL()+"/api/v1/chat", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if csTenant := d.effectiveTenantID(r); csTenant != "" {
		httpReq.Header.Set("X-ChirpStack-Tenant-Id", csTenant)
	}
	if user, ok := auth.UserFromContext(r.Context()); ok {
		httpReq.Header.Set("X-User-Roles", joinRoles(user.Roles))
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unavailable: "+err.Error())
		return
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		writeError(w, http.StatusBadGateway, string(raw))
		return
	}

	var out agentChatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		writeError(w, http.StatusBadGateway, "invalid agent response")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (d Deps) agentTools(w http.ResponseWriter, r *http.Request) {
	var resolved store.AgentResolvedConfig
	if tid, ok := d.platformTenantID(r.Context(), r); ok && d.AgentConfig != nil {
		if cfg, err := d.resolveAgentConfigForTenant(r.Context(), *tid); err == nil {
			resolved = cfg
		}
	}

	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, agentBaseURL()+"/api/v1/tools", nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if csTenant := d.effectiveTenantID(r); csTenant != "" {
		httpReq.Header.Set("X-ChirpStack-Tenant-Id", csTenant)
	}
	if resolved.SystemPrompt != "" {
		if cfgJSON, err := json.Marshal(resolved); err == nil {
			httpReq.Header.Set("X-Tenant-Agent-Config", string(cfgJSON))
		}
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unavailable")
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(raw)
		return
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		writeError(w, http.StatusBadGateway, "invalid agent response")
		return
	}
	if resolved.WelcomeMessage != "" {
		out["welcomeMessage"] = resolved.WelcomeMessage
		out["suggestions"] = resolved.Suggestions
		out["displayName"] = resolved.DisplayName
	}
	writeJSON(w, http.StatusOK, out)
}

func joinRoles(roles []string) string {
	if len(roles) == 0 {
		return ""
	}
	out := roles[0]
	for _, r := range roles[1:] {
		out += "," + r
	}
	return out
}

func (d Deps) agentChatWithLicense(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "agent") {
		return
	}
	d.agentChat(w, r)
}

func (d Deps) agentToolsWithLicense(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "agent") {
		return
	}
	d.agentTools(w, r)
}
