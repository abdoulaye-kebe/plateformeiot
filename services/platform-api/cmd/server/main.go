package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/chirpstack"
	"github.com/lorawan-platform/platform-api/internal/config"
	"github.com/lorawan-platform/platform-api/internal/handler"
	"github.com/lorawan-platform/platform-api/internal/keycloak"
	"github.com/lorawan-platform/platform-api/internal/objectstore"
	"github.com/lorawan-platform/platform-api/internal/store"
	"github.com/lorawan-platform/platform-api/internal/vpnpki"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	ctx := context.Background()
	db, err := store.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	tenantStore := store.NewTenantStore(db)
	tenantMembers := store.NewTenantMemberStore(db)
	tenantResources := store.NewTenantResourceStore(db)
	apiKeyStore := store.NewAPIKeyStore(db)
	analyticsStore := store.NewAnalyticsStore(db)
	anomalyStore := store.NewAnomalyStore(db)
	payloadStore := store.NewPayloadStore(db)
	fuotaStore := store.NewFuotaStore(db)
	planStore := store.NewPlanStore(db)
	ruleStore := store.NewRuleStore(db)
	nocStore := store.NewNOCStore(db)
	billingStore := store.NewBillingStore(db)
	rfScanStore := store.NewRfScanStore(db)
	customDashboardStore := store.NewCustomDashboardStore(db)
	connectorStore := store.NewConnectorStore(db)
	decoderStore := store.NewDecoderStore(db)
	agentConfigStore := store.NewAgentConfigStore(db)
	csClient := chirpstack.NewClient(cfg.ChirpStackRESTURL, cfg.ChirpStackAPIToken)
	kcClient := keycloak.NewClient(keycloak.Config{
		AdminURL:  cfg.KeycloakAdminURL,
		Realm:     cfg.KeycloakRealm,
		AdminUser: cfg.KeycloakAdminUser,
		AdminPass: cfg.KeycloakAdminPass,
	})

	var objectStore *objectstore.Client
	if cfg.MinIOAccessKey != "" {
		osClient, err := objectstore.New(objectstore.Config{
			Endpoint:  cfg.MinIOEndpoint,
			AccessKey: cfg.MinIOAccessKey,
			SecretKey: cfg.MinIOSecretKey,
			Bucket:    cfg.MinIOBucket,
			UseSSL:    cfg.MinIOUseSSL,
		}, logger)
		if err != nil {
			logger.Warn("minio unavailable", "error", err)
		} else {
			objectStore = osClient
			logger.Info("minio object store enabled", "bucket", cfg.MinIOBucket)
		}
	}

	var validator *auth.Validator
	if cfg.AuthEnabled {
		validator = auth.NewValidator(cfg.KeycloakJWKSURL, cfg.KeycloakIssuer, cfg.AuthEnabled, cfg.AuthRequired)
	}

	router := handler.NewRouter(handler.Deps{
		Logger:               logger,
		TenantStore:          tenantStore,
		TenantMembers:        tenantMembers,
		TenantResources:      tenantResources,
		APIKeys:              apiKeyStore,
		Keycloak:             kcClient,
		Analytics:            analyticsStore,
		Anomalies:            anomalyStore,
		Payloads:             payloadStore,
		Fuota:                fuotaStore,
		Plans:                planStore,
		ObjectStore:          objectStore,
		Rules:                ruleStore,
		NOC:                  nocStore,
		Billing:              billingStore,
		RfScan:               rfScanStore,
		CustomDashboards:     customDashboardStore,
		Connectors:           connectorStore,
		Decoders:             decoderStore,
		AgentConfig:          agentConfigStore,
		Auth:                 validator,
		ChirpStack:           csClient,
		TenantID:             cfg.ChirpStackTenantID,
		ChirpStackRESTURL:    cfg.ChirpStackRESTURL,
		ChirpStackConfigured: cfg.ChirpStackAPIToken != "",
		AuthEnabled:          cfg.AuthEnabled,
		PresignExpiry:        15 * time.Minute,
		StripeSecretKey:      cfg.StripeSecretKey,
		StripeWebhookSecret:  cfg.StripeWebhookSecret,
		StripeSuccessURL:     cfg.StripeSuccessURL,
		StripeCancelURL:      cfg.StripeCancelURL,
		KeycloakConsoleURL:   cfg.ConsolePublicURL,
		LNSPublicHost:        cfg.LNSPublicHost,
		LNSSemtechPort:       cfg.LNSSemtechPort,
		LNSBasicStationPort:  cfg.LNSBasicStationPort,
		OpenVPNEnabled:       cfg.OpenVPNEnabled,
		OpenVPNPublicHost:    cfg.OpenVPNPublicHost,
		OpenVPNPort:          cfg.OpenVPNPort,
		OpenVPNTunGatewayIP:  cfg.OpenVPNTunGatewayIP,
		VpnPKI:               vpnpki.NewClient(cfg.VpnPKIURL),
	})

	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("platform-api listening", "addr", cfg.Addr, "auth", cfg.AuthEnabled, "authRequired", cfg.AuthRequired)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
}
