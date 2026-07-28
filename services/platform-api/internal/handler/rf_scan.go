package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) getGatewayRfScan(w http.ResponseWriter, r *http.Request) {
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	gwData, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	gateway := gatewayMapFromResponse(gwData)
	if !gatewayRfScanSupported(gateway) {
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": false,
			"gatewayId": gatewayID,
		})
		return
	}

	resp := map[string]any{
		"supported": true,
		"gatewayId": gatewayID,
		"model":     gatewayRfScanModel(gateway),
	}

	if d.RfScan != nil {
		if latest, err := d.RfScan.Latest(r.Context(), gatewayID); err == nil && latest != nil {
			resp["latest"] = latest
		}
		if history, err := d.RfScan.List(r.Context(), gatewayID, 5); err == nil {
			resp["history"] = history
		}
		if pending, err := d.RfScan.PendingRequest(r.Context(), gatewayID); err == nil && pending != nil {
			resp["pendingRequest"] = pending
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (d Deps) requestGatewayRfScan(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	gwData, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !gatewayRfScanSupported(gatewayMapFromResponse(gwData)) {
		writeError(w, http.StatusBadRequest, "gateway does not support RF scan")
		return
	}
	if d.RfScan == nil {
		writeError(w, http.StatusServiceUnavailable, "rf scan store unavailable")
		return
	}
	if pending, _ := d.RfScan.PendingRequest(r.Context(), gatewayID); pending != nil {
		writeJSON(w, http.StatusOK, map[string]any{"request": pending, "message": "scan already pending"})
		return
	}

	tenantID, ok := d.dataTenantScope(w, r)
	if !ok || tenantID == nil {
		return
	}
	requestedBy := ""
	if user, ok := auth.UserFromContext(r.Context()); ok {
		requestedBy = user.Subject
	}
	req, err := d.RfScan.CreateRequest(r.Context(), *tenantID, gatewayID, requestedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"request": req})
}

func (d Deps) getGatewayRfScanPending(w http.ResponseWriter, r *http.Request) {
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	if d.RfScan == nil {
		writeError(w, http.StatusServiceUnavailable, "rf scan store unavailable")
		return
	}
	pending, err := d.RfScan.PendingRequest(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pending == nil {
		writeJSON(w, http.StatusOK, map[string]any{"pending": false})
		return
	}
	_ = d.RfScan.MarkRequestRunning(r.Context(), pending.ID)
	writeJSON(w, http.StatusOK, map[string]any{"pending": true, "request": pending})
}

type rfScanResultsRequest struct {
	RequestID     *string           `json:"requestId"`
	FreqStartHz   int64             `json:"freqStartHz"`
	ChannelStepHz int               `json:"channelStepHz"`
	Region        string            `json:"region"`
	Bins          []store.RfScanBin `json:"bins"`
}

func (d Deps) uploadGatewayRfScanResults(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	gwData, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !gatewayRfScanSupported(gatewayMapFromResponse(gwData)) {
		writeError(w, http.StatusBadRequest, "gateway does not support RF scan")
		return
	}
	if d.RfScan == nil {
		writeError(w, http.StatusServiceUnavailable, "rf scan store unavailable")
		return
	}

	var req rfScanResultsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Bins) == 0 {
		writeError(w, http.StatusBadRequest, "bins required")
		return
	}
	if req.ChannelStepHz <= 0 {
		req.ChannelStepHz = 200000
	}
	if req.Region == "" {
		req.Region = "EU868"
	}

	tenantID, ok := d.dataTenantScope(w, r)
	if !ok || tenantID == nil {
		return
	}

	var requestID *uuid.UUID
	if req.RequestID != nil && *req.RequestID != "" {
		if id, err := uuid.Parse(*req.RequestID); err == nil {
			requestID = &id
		}
	}

	polluters := detectPolluters(req.Bins)
	result, err := d.RfScan.SaveResult(r.Context(), *tenantID, gatewayID, requestID,
		req.FreqStartHz, req.ChannelStepHz, req.Region, req.Bins, polluters)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"result": result})
}
