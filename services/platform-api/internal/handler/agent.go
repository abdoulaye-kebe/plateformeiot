package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/lorawan-platform/platform-api/internal/auth"
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

	body, _ := json.Marshal(req)
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
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, agentBaseURL()+"/api/v1/tools", nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if csTenant := d.effectiveTenantID(r); csTenant != "" {
		httpReq.Header.Set("X-ChirpStack-Tenant-Id", csTenant)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unavailable")
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(raw)
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
