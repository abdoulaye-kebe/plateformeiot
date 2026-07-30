package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/chirpstack"
	"github.com/lorawan-platform/platform-api/internal/keycloak"
	"github.com/lorawan-platform/platform-api/internal/objectstore"
	"github.com/lorawan-platform/platform-api/internal/store"
)

type Deps struct {
	Logger               *slog.Logger
	TenantStore          *store.TenantStore
	TenantMembers        *store.TenantMemberStore
	TenantResources      *store.TenantResourceStore
	APIKeys              *store.APIKeyStore
	ChirpStack           *chirpstack.Client
	Keycloak             *keycloak.Client
	Analytics            *store.AnalyticsStore
	Anomalies            *store.AnomalyStore
	Payloads             *store.PayloadStore
	Plans                *store.PlanStore
	Fuota                *store.FuotaStore
	ObjectStore          *objectstore.Client
	Rules                *store.RuleStore
	NOC                  *store.NOCStore
	Billing              *store.BillingStore
	RfScan               *store.RfScanStore
	CustomDashboards     *store.CustomDashboardStore
	Connectors           *store.ConnectorStore
	Auth                 *auth.Validator
	TenantID             string
	ChirpStackRESTURL    string
	ChirpStackConfigured bool
	AuthEnabled          bool
	PresignExpiry        time.Duration
	StripeSecretKey      string
	StripeWebhookSecret  string
	StripeSuccessURL     string
	StripeCancelURL      string
	KeycloakConsoleURL   string
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(corsMiddleware)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "platform-api"})
	})

	r.Post("/api/v1/billing/stripe/webhook", deps.stripeWebhook)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(deps.combinedAuth)

		r.Get("/status", deps.platformStatus)
		r.Get("/auth/me", deps.authMe)
		r.Get("/tenants/me", deps.myTenant)
		r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/plans", deps.listPlans)

		r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Post("/agent/chat", deps.agentChatWithLicense)
		r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/agent/tools", deps.agentToolsWithLicense)

		r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/tenants", deps.listTenants)
		r.With(auth.RequireRoles("platform-admin")).Post("/tenants", deps.createTenant)
		r.With(auth.RequireRoles("platform-admin")).Get("/tenants/{id}", deps.getTenant)
		r.With(auth.RequireRoles("platform-admin")).Get("/tenants/{id}/members", deps.listTenantMembers)
		r.With(auth.RequireRoles("platform-admin")).Post("/tenants/{id}/members", deps.createTenantMember)
		r.With(auth.RequireRoles("platform-admin")).Patch("/tenants/{id}/status", deps.updateTenantStatus)
		r.With(auth.RequireRoles("platform-admin")).Delete("/tenants/{id}", deps.deleteTenant)

		r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/api-keys", deps.listAPIKeys)
		r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Post("/api-keys", deps.createAPIKey)
		r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Delete("/api-keys/{id}", deps.revokeAPIKey)

		r.Route("/lorawan", func(r chi.Router) {
			r.Get("/applications", deps.listApplications)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/applications", deps.createApplication)
			r.Get("/device-profiles", deps.listDeviceProfiles)

			r.Get("/devices", deps.listDevices)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/devices", deps.createDevice)
			r.Get("/devices/{devEui}", deps.getDevice)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Put("/devices/{devEui}", deps.updateDevice)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Delete("/devices/{devEui}", deps.deleteDevice)
			r.Get("/devices/{devEui}/events", deps.getDeviceEvents)
			r.Get("/devices/{devEui}/payloads", deps.listDevicePayloads)
			r.Get("/payloads/{id}/download", deps.getPayloadDownloadURL)

			r.Get("/gateways", deps.listGateways)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/gateways", deps.createGateway)
			r.Get("/gateways/{gatewayId}", deps.getGateway)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Put("/gateways/{gatewayId}", deps.updateGateway)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Delete("/gateways/{gatewayId}", deps.deleteGateway)

			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/gateways/{gatewayId}/rf-scan", deps.getGatewayRfScan)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/gateways/{gatewayId}/rf-scan/request", deps.requestGatewayRfScan)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Get("/gateways/{gatewayId}/rf-scan/pending", deps.getGatewayRfScanPending)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/gateways/{gatewayId}/rf-scan/results", deps.uploadGatewayRfScanResults)

			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/chirpstack/tenants", deps.listChirpStackTenants)
		})

		r.Route("/analytics", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/overview", deps.analyticsOverview)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/traffic", deps.analyticsTraffic)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/devices/{devEui}/radio", deps.analyticsDeviceRadio)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/devices/traffic", deps.analyticsDevicesTraffic)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/anomalies", deps.listAnomaliesLicensed)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Patch("/anomalies/{id}/resolve", deps.resolveAnomaly)
		})

		r.Route("/fuota", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/deployments", deps.listFuotaDeploymentsLicensed)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/deployments", deps.createFuotaDeploymentLicensed)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/deployments/{id}/start", deps.startFuotaDeploymentLicensed)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/firmware", deps.uploadFuotaFirmwareLicensed)
		})

		r.Route("/rules", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/", deps.listRules)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/", deps.createRule)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Delete("/{id}", deps.deleteRule)
		})

		r.Route("/noc", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Get("/alerts", deps.nocAlerts)
		})

		r.Route("/billing", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/usage", deps.billingUsage)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/history", deps.billingHistory)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Get("/subscription", deps.billingSubscription)
			r.With(auth.RequireRoles("platform-admin")).Post("/aggregate", deps.billingAggregate)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Post("/stripe/checkout", deps.createStripeCheckout)
		})

		r.Route("/dashboards", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/", deps.listCustomDashboards)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/", deps.createCustomDashboard)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/{id}", deps.getCustomDashboard)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Put("/{id}", deps.updateCustomDashboard)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin")).Delete("/{id}", deps.deleteCustomDashboard)
		})

		r.Route("/onboarding", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/status", deps.getOnboardingStatus)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/bootstrap", deps.onboardingBootstrap)
		})

		r.Route("/connectors", func(r chi.Router) {
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator", "viewer")).Get("/", deps.listConnectors)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/", deps.createConnector)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Put("/{id}", deps.updateConnector)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Delete("/{id}", deps.deleteConnector)
			r.With(auth.RequireRoles("platform-admin", "tenant-admin", "operator")).Post("/{id}/test", deps.testConnector)
		})
	})

	return r
}

func corsAllowedOrigins() []string {
	origins := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	}
	if u := strings.TrimSpace(os.Getenv("CONSOLE_PUBLIC_URL")); u != "" {
		u = strings.TrimSuffix(u, "/")
		if !containsString(origins, u) {
			origins = append(origins, u)
		}
	}
	return origins
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func corsMiddleware(next http.Handler) http.Handler {
	allowed := corsAllowedOrigins()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if containsString(allowed, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (d Deps) platformStatus(w http.ResponseWriter, r *http.Request) {
	pingTenant := d.effectiveTenantID(r)
	if pingTenant == "" {
		pingTenant = d.TenantID
	}

	networkOK := false
	if d.ChirpStackConfigured && pingTenant != "" {
		networkOK = d.ChirpStack.Ping(r.Context(), pingTenant) == nil
	}

	if d.isPlatformAdminUser(r) {
		status := map[string]any{
			"chirpstackConfigured": d.ChirpStackConfigured,
			"chirpstackRestUrl":    d.ChirpStackRESTURL,
			"chirpstackTenantId":   d.TenantID,
			"chirpstackConnected":  networkOK,
			"networkConnected":     networkOK,
			"authEnabled":          d.AuthEnabled,
			"chirpstackPingTenantId": pingTenant,
		}
		if !networkOK && d.ChirpStackConfigured {
			if err := d.ChirpStack.Ping(r.Context(), pingTenant); err != nil {
				status["chirpstackError"] = err.Error()
			}
		}
		writeJSON(w, http.StatusOK, status)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"networkConnected": networkOK,
		"authEnabled":      d.AuthEnabled,
		"service":          "lorawan-platform",
	})
}

func (d Deps) listTenants(w http.ResponseWriter, r *http.Request) {
	tenants, err := d.resolveTenantForList(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": tenants})
}

func (d Deps) listDevices(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	data, err := d.ChirpStack.ListDevices(r.Context(), d.effectiveTenantID(r), limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) getDevice(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	data, err := d.ChirpStack.GetDevice(r.Context(), devEUI)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) getDeviceEvents(w http.ResponseWriter, r *http.Request) {
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	limit := queryInt(r, "limit", 20)
	data, err := d.ChirpStack.GetDeviceEvents(r.Context(), devEUI, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) listGateways(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	data, err := d.ChirpStack.ListGateways(r.Context(), d.effectiveTenantID(r), limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	enrichGatewayList(data)
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) getGateway(w http.ResponseWriter, r *http.Request) {
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	data, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	enrichGatewayResponse(data)
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) listChirpStackTenants(w http.ResponseWriter, r *http.Request) {
	data, err := d.ChirpStack.ListTenants(r.Context(), queryInt(r, "limit", 10))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func queryInt(r *http.Request, key string, fallback int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
