package config

import "os"

type Config struct {
	DatabaseURL string
	IntervalSec int
}

func Load() Config {
	interval := 300
	if v := os.Getenv("ANOMALY_INTERVAL_SEC"); v != "" {
		if n, err := parseInt(v); err == nil && n > 0 {
			interval = n
		}
	}
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable"),
		IntervalSec: interval,
	}
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func parseInt(s string) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, os.ErrInvalid
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}
