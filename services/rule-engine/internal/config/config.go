package config

import "os"

type Config struct {
	DatabaseURL string
	NATSURL     string
}

func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable"),
		NATSURL:     env("NATS_URL", "nats://nats:4222"),
	}
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
