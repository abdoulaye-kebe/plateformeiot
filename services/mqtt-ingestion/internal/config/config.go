package config

import (
	"os"
	"strings"
)

type Config struct {
	MQTTBrokerURL string
	MQTTClientID  string
	DatabaseURL   string
	NATSURL       string
	Region        string
	Topics        []string
	MinIOEndpoint string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket   string
	MinIOUseSSL   bool
}

func Load() Config {
	topics := strings.Split(env("MQTT_TOPICS", "application/+/device/+/event/up,eu868/gateway/+/event/stats"), ",")
	return Config{
		MQTTBrokerURL: env("MQTT_BROKER_URL", "tcp://mosquitto:1883"),
		MQTTClientID:  env("MQTT_CLIENT_ID", "platform-mqtt-ingestion"),
		DatabaseURL:   env("DATABASE_URL", "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable"),
		NATSURL:       env("NATS_URL", "nats://nats:4222"),
		Region:        env("LORAWAN_REGION", "eu868"),
		Topics:        topics,
		MinIOEndpoint: env("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey: env("MINIO_ACCESS_KEY", "platform"),
		MinIOSecretKey: env("MINIO_SECRET_KEY", "platform123"),
		MinIOBucket:   env("MINIO_BUCKET", "lorawan-payloads"),
		MinIOUseSSL:   env("MINIO_USE_SSL", "false") == "true",
	}
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
