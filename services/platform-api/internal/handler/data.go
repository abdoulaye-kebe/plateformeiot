package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) listDataMessages(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}

	filter := store.MessageFilter{Limit: queryInt(r, "limit", 50)}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.From = &t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.To = &t
		}
	}
	filter.DevEUI = strings.TrimSpace(r.URL.Query().Get("devEui"))
	filter.ApplicationID = strings.TrimSpace(r.URL.Query().Get("applicationId"))
	filter.Search = strings.TrimSpace(r.URL.Query().Get("q"))
	if fp := r.URL.Query().Get("fPort"); fp != "" {
		n := queryInt(r, "fPort", 0)
		if n > 0 {
			filter.FPort = &n
		}
	}

	records, err := d.Payloads.ListMessages(r.Context(), scope, filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	total, _ := d.Payloads.CountMessages(r.Context(), scope, filter)

	writeJSON(w, http.StatusOK, map[string]any{
		"result":     records,
		"totalCount": total,
	})
}

func deviceConnectivityStatus(lastSeen time.Time) string {
	if lastSeen.IsZero() {
		return "offline"
	}
	since := time.Since(lastSeen)
	switch {
	case since <= time.Hour:
		return "online"
	case since <= 7 * 24 * time.Hour:
		return "sleeping"
	default:
		return "offline"
	}
}
