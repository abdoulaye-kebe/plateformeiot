package config

import (
	"os"
	"strings"
)

type Config struct {
	Addr               string
	DatabaseURL        string
	RedisURL           string
	NATSURL            string
	ChirpStackRESTURL  string
	ChirpStackAPIToken string
	ChirpStackTenantID string
	AuthEnabled        bool
	AuthRequired       bool
	KeycloakIssuer     string
	KeycloakJWKSURL    string
	KeycloakAdminURL   string
	KeycloakRealm      string
	KeycloakAdminUser  string
	KeycloakAdminPass  string
	MinIOEndpoint      string
	MinIOAccessKey     string
	MinIOSecretKey     string
	MinIOBucket        string
	MinIOUseSSL        bool
	StripeSecretKey    string
	StripeWebhookSecret string
	StripeSuccessURL   string
	StripeCancelURL    string
	ConsolePublicURL   string
}

func Load() Config {
	authMode := strings.ToLower(env("AUTH_MODE", "optional"))
	return Config{
		Addr:               env("PLATFORM_ADDR", ":8081"),
		DatabaseURL:        env("DATABASE_URL", "postgres://platform:platform@localhost:5433/platform?sslmode=disable"),
		RedisURL:           env("REDIS_URL", "redis://localhost:6380/0"),
		NATSURL:            env("NATS_URL", "nats://localhost:4222"),
		ChirpStackRESTURL:  env("CHIRPSTACK_REST_URL", "http://localhost:8090"),
		ChirpStackAPIToken: env("CHIRPSTACK_API_TOKEN", ""),
		ChirpStackTenantID: env("CHIRPSTACK_TENANT_ID", ""),
		AuthEnabled:        authMode != "disabled",
		AuthRequired:       authMode == "required",
		KeycloakIssuer:     env("KEYCLOAK_ISSUER", "http://localhost:8082/realms/lorawan"),
		KeycloakJWKSURL:    env("KEYCLOAK_JWKS_URL", "http://keycloak:8080/realms/lorawan/protocol/openid-connect/certs"),
		KeycloakAdminURL:   env("KEYCLOAK_ADMIN_URL", "http://keycloak:8080"),
		KeycloakRealm:      env("KEYCLOAK_REALM", "lorawan"),
		KeycloakAdminUser:  env("KEYCLOAK_ADMIN_USER", "admin"),
		KeycloakAdminPass:  env("KEYCLOAK_ADMIN_PASSWORD", "admin"),
		MinIOEndpoint:      env("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey:     env("MINIO_ACCESS_KEY", "platform"),
		MinIOSecretKey:     env("MINIO_SECRET_KEY", "platform123"),
		MinIOBucket:        env("MINIO_BUCKET", "lorawan-payloads"),
		MinIOUseSSL:        env("MINIO_USE_SSL", "false") == "true",
		StripeSecretKey:    env("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET", ""),
		StripeSuccessURL:   env("STRIPE_SUCCESS_URL", "http://localhost:3000/billing?paid=1"),
		StripeCancelURL:    env("STRIPE_CANCEL_URL", "http://localhost:3000/billing"),
		ConsolePublicURL:   env("CONSOLE_PUBLIC_URL", "http://localhost:3000"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
