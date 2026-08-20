package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

type lnsConnectivityConfig struct {
	PublicHost   string         `json:"publicHost"`
	SemtechUDP   lnsMode        `json:"semtechUdp"`
	BasicStation lnsMode        `json:"basicStation"`
	OpenVPN      lnsOpenVPNMode `json:"openVpn"`
}

type lnsMode struct {
	Enabled  bool   `json:"enabled"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Note     string `json:"note,omitempty"`
}

type lnsOpenVPNMode struct {
	Enabled          bool   `json:"enabled"`
	ServerHost       string `json:"serverHost"`
	ServerPort       int    `json:"serverPort"`
	TUNGatewayIP     string `json:"tunGatewayIp"`
	SemtechHost      string `json:"semtechHost"`
	SemtechPort      int    `json:"semtechPort"`
	BasicStationHost string `json:"basicStationHost"`
	BasicStationPort int    `json:"basicStationPort"`
	Note             string `json:"note,omitempty"`
}

func (d Deps) lnsConnectivityConfig() lnsConnectivityConfig {
	host := d.LNSPublicHost
	if host == "" {
		host = "localhost"
	}
	cfg := lnsConnectivityConfig{
		PublicHost: host,
		SemtechUDP: lnsMode{
			Enabled:  true,
			Host:     host,
			Port:     d.LNSSemtechPort,
			Protocol: "udp",
			Note:     "Semtech UDP Packet Forwarder v2 — stats toutes les 30 s obligatoires",
		},
		BasicStation: lnsMode{
			Enabled:  true,
			Host:     host,
			Port:     d.LNSBasicStationPort,
			Protocol: "tcp",
			Note:     "Basic Station (WebSocket/TLS) — recommandé si la gateway le supporte",
		},
		OpenVPN: lnsOpenVPNMode{
			Enabled:          d.OpenVPNEnabled && d.VpnPKI != nil && d.VpnPKI.Enabled(),
			ServerHost:       d.OpenVPNPublicHost,
			ServerPort:       d.OpenVPNPort,
			TUNGatewayIP:     d.OpenVPNTunGatewayIP,
			SemtechHost:      d.OpenVPNTunGatewayIP,
			SemtechPort:      d.LNSSemtechPort,
			BasicStationHost: d.OpenVPNTunGatewayIP,
			BasicStationPort: d.LNSBasicStationPort,
			Note:             "Téléchargez le profil .ovpn par gateway ; après connexion, ciblez le LNS via l'IP tunnel",
		},
	}
	if cfg.OpenVPN.ServerHost == "" {
		cfg.OpenVPN.ServerHost = host
	}
	return cfg
}

func (d Deps) getLnsConnectivity(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, d.lnsConnectivityConfig())
}

func (d Deps) getGatewayConnectivity(w http.ResponseWriter, r *http.Request) {
	gatewayID := strings.ToLower(chi.URLParam(r, "gatewayId"))
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	cfg := d.lnsConnectivityConfig()
	resp := map[string]any{
		"gatewayId":   gatewayID,
		"platform":    cfg,
		"modes":       []string{"semtech_udp", "basic_station", "openvpn"},
		"recommended": recommendedConnectivity(cfg),
	}
	if d.TenantResources != nil {
		if row, err := d.TenantResources.GetGatewayConnectivity(r.Context(), gatewayID); err == nil {
			resp["preferredMode"] = row.PreferredConnectivityMode
			resp["vpnCertIssuedAt"] = row.VpnCertIssuedAt
			resp["vpnCertRevokedAt"] = row.VpnCertRevokedAt
			resp["vpnProfileAvailable"] = row.VpnCertIssuedAt != nil && row.VpnCertRevokedAt == nil
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func recommendedConnectivity(cfg lnsConnectivityConfig) string {
	if cfg.OpenVPN.Enabled {
		return "openvpn"
	}
	return "semtech_udp"
}

type updateGatewayConnectivityRequest struct {
	PreferredMode string `json:"preferredMode"`
}

func (d Deps) updateGatewayConnectivity(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := strings.ToLower(chi.URLParam(r, "gatewayId"))
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	var req updateGatewayConnectivityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	mode := strings.ToLower(strings.TrimSpace(req.PreferredMode))
	switch mode {
	case "semtech_udp", "basic_station", "openvpn":
	default:
		writeError(w, http.StatusBadRequest, "preferredMode must be semtech_udp, basic_station or openvpn")
		return
	}
	if mode == "openvpn" && (!d.OpenVPNEnabled || d.VpnPKI == nil || !d.VpnPKI.Enabled()) {
		writeError(w, http.StatusBadRequest, "openvpn not enabled on this platform")
		return
	}
	if err := d.TenantResources.SetGatewayConnectivityMode(r.Context(), gatewayID, mode); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	d.getGatewayConnectivity(w, r)
}

func (d Deps) issueGatewayVpnProfile(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := strings.ToLower(chi.URLParam(r, "gatewayId"))
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	if !d.OpenVPNEnabled || d.VpnPKI == nil || !d.VpnPKI.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "openvpn service not configured")
		return
	}
	profile, err := d.VpnPKI.IssueProfile(gatewayID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	_ = d.TenantResources.MarkVpnCertIssued(r.Context(), gatewayID)
	if tenantID, ok := d.platformTenantID(r.Context(), r); ok {
		_ = d.TenantResources.LogConnectivityAudit(r.Context(), gatewayID, *tenantID, "vpn_issue", "profile issued")
	}
	w.Header().Set("Content-Type", "application/x-openvpn-profile")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+gatewayID+".ovpn\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(profile)
}

func (d Deps) revokeGatewayVpnProfile(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := strings.ToLower(chi.URLParam(r, "gatewayId"))
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	if d.VpnPKI == nil || !d.VpnPKI.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "openvpn service not configured")
		return
	}
	if err := d.VpnPKI.Revoke(gatewayID); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	_ = d.TenantResources.MarkVpnCertRevoked(r.Context(), gatewayID)
	if tenantID, ok := d.platformTenantID(r.Context(), r); ok {
		_ = d.TenantResources.LogConnectivityAudit(r.Context(), gatewayID, *tenantID, "vpn_revoke", "certificate revoked")
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked", "gatewayId": gatewayID})
}
