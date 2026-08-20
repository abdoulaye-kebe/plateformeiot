package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/lorawan-platform/vpn-pki/internal/pki"
)

func NewRouter(mgr *pki.Manager, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "vpn-pki"})
	})
	r.Post("/clients/{cn}", issueClient(mgr))
	r.Get("/clients/{cn}", issueClient(mgr))
	r.Delete("/clients/{cn}", revokeClient(mgr))
	return r
}

func issueClient(mgr *pki.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cn := strings.ToLower(chi.URLParam(r, "cn"))
		data, err := mgr.IssueClient(cn)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/x-openvpn-profile")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+cn+".ovpn\"")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, string(data))
	}
}

func revokeClient(mgr *pki.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cn := strings.ToLower(chi.URLParam(r, "cn"))
		if err := mgr.RevokeClient(cn); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "revoked", "cn": cn})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
