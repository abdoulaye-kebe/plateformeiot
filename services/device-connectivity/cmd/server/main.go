package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/lorawan-platform/device-connectivity/internal/config"
	"github.com/lorawan-platform/device-connectivity/internal/ingest"
	"github.com/lorawan-platform/device-connectivity/internal/lwm2mserver"
	"github.com/lorawan-platform/device-connectivity/internal/mqttbroker"
	"github.com/lorawan-platform/device-connectivity/internal/natsbus"
	"github.com/lorawan-platform/device-connectivity/internal/store"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	db, err := store.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	endpoints := store.NewEndpointStore(db)
	var publisher *natsbus.Publisher
	if cfg.NATSURL != "" {
		nc, err := natsbus.Connect(cfg.NATSURL)
		if err != nil {
			logger.Warn("nats unavailable", "error", err)
		} else {
			defer nc.Close()
			publisher = natsbus.NewPublisher(nc)
		}
	}
	processor := ingest.NewProcessor(endpoints, publisher, logger)

	broker, err := mqttbroker.New(cfg.MQTTAddr, endpoints, processor, logger)
	if err != nil {
		logger.Error("mqtt broker failed", "error", err)
		os.Exit(1)
	}
	go func() {
		if err := broker.Start(); err != nil {
			logger.Error("mqtt broker stopped", "error", err)
		}
	}()
	defer broker.Close()

	go func() {
		if err := lwm2mserver.StartUDP(cfg.LwM2MAddr, endpoints, processor, logger); err != nil {
			logger.Error("lwm2m udp server stopped", "error", err)
		}
	}()

	go func() {
		if err := lwm2mserver.StartDTLS(cfg.LwM2MDTLSAddr, endpoints, processor, logger); err != nil {
			logger.Error("lwm2m dtls server stopped", "error", err)
		}
	}()

	logger.Info("device-connectivity started",
		"mqtt", cfg.MQTTAddr,
		"lwm2mUdp", cfg.LwM2MAddr,
		"lwm2mDtls", cfg.LwM2MDTLSAddr,
		"publicMqtt", cfg.MQTTPublicURL(),
		"publicLwm2m", cfg.LwM2MPublicURL(),
		"publicLwm2mDtls", cfg.LwM2MDTLSPublicURL(),
	)
	<-ctx.Done()
	logger.Info("shutting down")
}
