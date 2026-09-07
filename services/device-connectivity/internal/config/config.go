package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL        string
	NATSURL            string
	MQTTAddr           string
	LwM2MAddr          string
	LwM2MDTLSAddr      string
	PublicHost         string
	MQTTPublicPort     int
	LwM2MDTLSPublicPort int
}

func Load() Config {
	publicHost := env("CELLULAR_PUBLIC_HOST", env("LNS_PUBLIC_HOST", "localhost"))
	return Config{
		DatabaseURL:         env("DATABASE_URL", "postgres://platform:platform@platform-postgres:5432/platform?sslmode=disable"),
		NATSURL:             env("NATS_URL", "nats://nats:4222"),
		MQTTAddr:            env("MQTT_LISTEN_ADDR", ":1884"),
		LwM2MAddr:           env("LWM2M_LISTEN_ADDR", ":5683"),
		LwM2MDTLSAddr:       env("LWM2M_DTLS_LISTEN_ADDR", ":5684"),
		PublicHost:          publicHost,
		MQTTPublicPort:      envInt("MQTT_PUBLIC_PORT", 1884),
		LwM2MDTLSPublicPort: envInt("LWM2M_DTLS_PUBLIC_PORT", 5684),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func (c Config) MQTTPublicURL() string {
	return "mqtt://" + strings.TrimSpace(c.PublicHost) + ":" + itoa(c.MQTTPublicPort)
}

func (c Config) LwM2MPublicURL() string {
	return "coap://" + strings.TrimSpace(c.PublicHost) + ":5683"
}

func (c Config) LwM2MDTLSPublicURL() string {
	return "coaps://" + strings.TrimSpace(c.PublicHost) + ":" + itoa(c.LwM2MDTLSPublicPort)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
