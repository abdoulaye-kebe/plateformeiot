package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) getIoTConnectivity(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"mqtt": map[string]any{
			"brokerUrl":      "mqtt://" + d.CellularPublicHost + ":" + itoaStr(d.CellularMQTTPort),
			"telemetryTopic": "devices/{externalId}/telemetry",
			"commandTopic":   "devices/{externalId}/command",
			"username":       "{externalId}",
		},
		"lwm2m": map[string]any{
			"serverUrl":    "coaps://" + d.CellularPublicHost + ":" + itoaStr(d.CellularLwM2MDTLSPort),
			"endpoint":     "{externalId}",
			"register":     "POST /rd?ep={externalId}&lt=300&lwm2m=1.1",
			"securityMode": "dtls-psk",
		},
	})
}

func (d Deps) listIoTDevices(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	protocol := strings.TrimSpace(r.URL.Query().Get("protocol"))
	list, err := d.DeviceEndpoints.ListByTenant(r.Context(), *tenantID, protocol, queryInt(r, "limit", 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows := make([]map[string]any, 0, len(list))
	for _, ep := range list {
		rows = append(rows, iotDeviceRow(ep))
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": rows, "totalCount": len(rows)})
}

func (d Deps) createIoTDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	var req struct {
		Name       string          `json:"name"`
		Protocol   string          `json:"protocol"`
		ExternalID string          `json:"externalId"`
		Metadata   json.RawMessage `json:"metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Protocol = strings.ToLower(strings.TrimSpace(req.Protocol))
	req.ExternalID = strings.TrimSpace(req.ExternalID)
	if req.Name == "" || req.Protocol == "" || req.ExternalID == "" {
		writeError(w, http.StatusBadRequest, "name, protocol and externalId are required")
		return
	}
	if req.Protocol != "mqtt" && req.Protocol != "lwm2m" {
		writeError(w, http.StatusBadRequest, "protocol must be mqtt or lwm2m")
		return
	}
	ep, creds, err := d.DeviceEndpoints.Create(r.Context(), store.CreateDeviceEndpointInput{
		TenantID:   *tenantID,
		Name:       req.Name,
		Protocol:   req.Protocol,
		ExternalID: req.ExternalID,
		Metadata:   req.Metadata,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"device":      iotDeviceRow(ep),
		"provision":   buildProvisionInfo(d, ep, creds),
		"credentials": creds,
	})
}

func (d Deps) getIoTDevice(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ep, err := d.DeviceEndpoints.Get(r.Context(), id, *tenantID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"device": iotDeviceRow(ep)})
}

func (d Deps) provisionIoTDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ep, err := d.DeviceEndpoints.Get(r.Context(), id, *tenantID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	var creds map[string]string
	_ = json.Unmarshal(ep.Credentials, &creds)
	writeJSON(w, http.StatusOK, map[string]any{"provision": buildProvisionInfo(d, ep, creds)})
}

func (d Deps) deleteIoTDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := d.DeviceEndpoints.Delete(r.Context(), id, *tenantID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (d Deps) listIoTDeviceTelemetry(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusBadRequest, "tenant required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := d.DeviceEndpoints.Get(r.Context(), id, *tenantID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	msgs, err := d.DeviceEndpoints.ListTelemetry(r.Context(), *tenantID, id, queryInt(r, "limit", 50))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": msgs})
}

func iotDeviceRow(ep store.DeviceEndpoint) map[string]any {
	status := "offline"
	if ep.LastSeenAt != nil {
		if time.Since(*ep.LastSeenAt) <= time.Hour {
			status = "online"
		} else if time.Since(*ep.LastSeenAt) <= 24*time.Hour {
			status = "recent"
		}
	}
	return map[string]any{
		"id":         ep.ID,
		"tenantId":   ep.TenantID,
		"name":       ep.Name,
		"protocol":   ep.Protocol,
		"externalId": ep.ExternalID,
		"metadata":   ep.Metadata,
		"enabled":    ep.Enabled,
		"lastSeenAt": ep.LastSeenAt,
		"status":     status,
		"createdAt":  ep.CreatedAt,
		"updatedAt":  ep.UpdatedAt,
	}
}

func buildProvisionInfo(d Deps, ep store.DeviceEndpoint, creds map[string]string) map[string]any {
	host := d.CellularPublicHost
	mqttPort := d.CellularMQTTPort
	out := map[string]any{
		"protocol":   ep.Protocol,
		"externalId": ep.ExternalID,
	}
	if ep.Protocol == "mqtt" {
		out["mqtt"] = map[string]any{
			"broker":         "mqtt://" + host + ":" + itoaStr(mqttPort),
			"username":       ep.ExternalID,
			"password":       creds["mqttPassword"],
			"telemetryTopic": "devices/" + ep.ExternalID + "/telemetry",
			"commandTopic":   "devices/" + ep.ExternalID + "/command",
			"examplePayload": `{"temperature":22.5,"battery":87}`,
		}
	}
	if ep.Protocol == "lwm2m" {
		dtlsPort := d.CellularLwM2MDTLSPort
		out["lwm2m"] = map[string]any{
			"server":         "coaps://" + host + ":" + itoaStr(dtlsPort),
			"endpoint":       ep.ExternalID,
			"registerUri":    "coaps://" + host + ":" + itoaStr(dtlsPort) + "/rd?ep=" + ep.ExternalID + "&lt=1800&lwm2m=1.1",
			"pskIdentity":    creds["pskIdentity"],
			"pskIdentityAlt": creds["pskIdentityAlt"],
			"psk":            creds["psk"],
			"pskKeyHex":      creds["psk"],
			"securityMode":   "dtls-psk",
			"lifetimeSec":    1800,
			"bootstrapUri":   "",
			"examplePayload": `{"3":{"0":{"11":"86"}}}`,
		}
	}
	return out
}

func itoaStr(n int) string {
	return strconv.Itoa(n)
}
