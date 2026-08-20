package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/lorawan-platform/vpn-pki/internal/handler"
	"github.com/lorawan-platform/vpn-pki/internal/pki"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := pki.LoadConfig()
	mgr := pki.NewManager(cfg, logger)

	if err := mgr.EnsureCA(); err != nil {
		logger.Error("pki init failed", "error", err)
		os.Exit(1)
	}

	addr := env("VPN_PKI_ADDR", ":8099")
	logger.Info("vpn-pki listening", "addr", addr, "pkiDir", cfg.PKIDir)
	if err := http.ListenAndServe(addr, handler.NewRouter(mgr, logger)); err != nil {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
