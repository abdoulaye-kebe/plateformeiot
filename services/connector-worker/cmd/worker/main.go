package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/google/uuid"
	"github.com/lorawan-platform/connector-worker/internal/config"
	"github.com/lorawan-platform/connector-worker/internal/dispatch"
	"github.com/lorawan-platform/connector-worker/internal/store"
	"github.com/nats-io/nats.go"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := store.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	connectors := store.NewConnectorStore(pool)
	dispatcher := dispatch.New()

	nc, err := nats.Connect(cfg.NATSURL)
	if err != nil {
		logger.Error("nats connect failed", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	_, err = nc.Subscribe("platform.events.uplink", func(msg *nats.Msg) {
		var event dispatch.UplinkEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			logger.Warn("invalid uplink event", "error", err)
			return
		}
		if event.TenantID == "" {
			return
		}
		tenantID, err := uuid.Parse(event.TenantID)
		if err != nil {
			return
		}
		list, err := connectors.ListEnabledForEvent(ctx, tenantID, "uplink")
		if err != nil {
			logger.Error("list connectors failed", "error", err, "tenantId", event.TenantID)
			return
		}
		if len(list) == 0 {
			return
		}
		payload := dispatch.BuildPayload(event)
		for _, c := range list {
			if err := dispatcher.Dispatch(ctx, c, payload); err != nil {
				logger.Warn("connector dispatch failed", "connector", c.Name, "type", c.Type, "error", err)
			} else {
				logger.Debug("connector dispatch ok", "connector", c.Name, "type", c.Type, "devEui", event.DevEUI)
			}
		}
	})
	if err != nil {
		logger.Error("subscribe failed", "error", err)
		os.Exit(1)
	}

	logger.Info("connector-worker started", "subject", "platform.events.uplink")
	<-ctx.Done()
}
