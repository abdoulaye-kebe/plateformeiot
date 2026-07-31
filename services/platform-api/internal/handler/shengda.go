package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func shengdaWaterURL() string {
	if u := os.Getenv("SHENGDA_WATER_URL"); u != "" {
		return u
	}
	return "http://shengda-water:8098"
}

func (d Deps) proxyShengda(w http.ResponseWriter, r *http.Request, method, path string, body io.Reader) {
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not mapped")
		return
	}

	target := shengdaWaterURL() + path
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	if !containsQuery(r.URL.RawQuery, "tenantId") {
		sep := "?"
		if r.URL.RawQuery != "" {
			sep = "&"
		}
		target += sep + "tenantId=" + platformTenant.String()
	}

	req, err := http.NewRequestWithContext(r.Context(), method, target, body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(raw)
}

func containsQuery(q, key string) bool {
	return q != "" && (q == key || len(q) > len(key) && (q[:len(key)+1] == key+"=" || containsSubstr(q, "&"+key+"=")))
}

func containsSubstr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func (d Deps) listShengdaMeters(w http.ResponseWriter, r *http.Request) {
	d.proxyShengda(w, r, http.MethodGet, "/meters", nil)
}

func (d Deps) getShengdaMeter(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	d.proxyShengda(w, r, http.MethodGet, "/meters/"+devEUI, nil)
}

func (d Deps) listShengdaReadings(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	d.proxyShengda(w, r, http.MethodGet, "/meters/"+devEUI+"/readings", nil)
}

func (d Deps) listShengdaCommands(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	d.proxyShengda(w, r, http.MethodGet, "/meters/"+devEUI+"/commands", nil)
}

func (d Deps) sendShengdaCommand(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	d.proxyShengda(w, r, http.MethodPost, "/meters/"+devEUI+"/commands", bytes.NewReader(raw))
}

func (d Deps) decodeShengdaPayload(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	d.proxyShengda(w, r, http.MethodPost, "/decode", bytes.NewReader(raw))
}

func (d Deps) getShengdaCodec(w http.ResponseWriter, r *http.Request) {
	d.proxyShengda(w, r, http.MethodGet, "/codec", nil)
}

type applyShengdaCodecRequest struct {
	DeviceProfileID string `json:"deviceProfileId"`
	Create          bool   `json:"create"`
	Name            string `json:"name"`
	Description     string `json:"description"`
}

func (d Deps) fetchShengdaCodecScript(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, shengdaWaterURL()+"/codec", nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("codec service %s: %s", resp.Status, string(raw))
	}
	var out struct {
		Script string `json:"script"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Script == "" {
		return "", fmt.Errorf("empty codec script")
	}
	return out.Script, nil
}

func (d Deps) applyShengdaCodec(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if !d.ChirpStackConfigured {
		writeError(w, http.StatusBadGateway, "ChirpStack not configured")
		return
	}
	var req applyShengdaCodecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	script, err := d.fetchShengdaCodecScript(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "codec unavailable: "+err.Error())
		return
	}

	csTenant := d.effectiveTenantID(r)

	if req.Create || req.DeviceProfileID == "" {
		name := req.Name
		if name == "" {
			name = "Shengda Water Meter V1.6"
		}
		desc := req.Description
		if desc == "" {
			desc = "Codec JavaScript Shengda — télérelevé eau et vanne (port downlink 2)"
		}
		data, err := d.ChirpStack.CreateDeviceProfileWithCodec(r.Context(), csTenant, name, desc, script)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, data)
		return
	}

	data, err := d.ChirpStack.ApplyDeviceProfileCodec(r.Context(), req.DeviceProfileID, script)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

type enqueueDownlinkRequest struct {
	Data      string `json:"data"`
	DataHex   string `json:"dataHex"`
	FPort     int    `json:"fPort"`
	Confirmed bool   `json:"confirmed"`
}

func downlinkPayloadBase64(dataB64, dataHex string) (string, error) {
	if dataB64 != "" {
		return dataB64, nil
	}
	dataHex = strings.ReplaceAll(strings.TrimSpace(dataHex), " ", "")
	if dataHex == "" {
		return "", errors.New("data or dataHex required")
	}
	raw, err := hex.DecodeString(dataHex)
	if err != nil {
		return "", errors.New("invalid dataHex")
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

func (d Deps) listDeviceDownlinkQueue(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	data, err := d.ChirpStack.GetDownlinkQueue(r.Context(), devEUI)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) enqueueDeviceDownlink(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	var req enqueueDownlinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	payloadB64, err := downlinkPayloadBase64(req.Data, req.DataHex)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.FPort <= 0 {
		req.FPort = 1
	}
	data, err := d.ChirpStack.EnqueueDownlink(r.Context(), devEUI, payloadB64, req.FPort, req.Confirmed)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) flushDeviceDownlink(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	if err := d.ChirpStack.FlushDownlinkQueue(r.Context(), devEUI); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// testShengdaWaterHTTP vérifie la connectivité au worker métier.
func testShengdaWaterHTTP(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, shengdaWaterURL()+"/health", nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return err
	}
	return nil
}
