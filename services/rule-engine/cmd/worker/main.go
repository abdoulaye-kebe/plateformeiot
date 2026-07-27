package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/lorawan-platform/rule-engine/internal/actions"
	"github.com/lorawan-platform/rule-engine/internal/config"
	"github.com/lorawan-platform/rule-engine/internal/engine"
	"github.com/lorawan-platform/rule-engine/internal/store"
	"github.com/nats-io/nats.go"
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

	ruleStore := store.NewRuleStore(db)
	execStore := store.NewExecutionStore(db)
	runner := engine.New(ruleStore, execStore, actions.NewExecutor(logger), logger)

	nc, err := nats.Connect(cfg.NATSURL)
	if err != nil {
		logger.Error("nats connect failed", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	_, err = nc.Subscribe("platform.events.uplink", func(msg *nats.Msg) {
		var event engine.UplinkEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			logger.Warn("invalid uplink event", "error", err)
			return
		}
		if err := runner.ProcessUplink(ctx, event); err != nil {
			logger.Error("rule processing failed", "error", err)
		}
	})
	if err != nil {
		logger.Error("subscribe failed", "error", err)
		os.Exit(1)
	}

	logger.Info("rule-engine started", "subject", "platform.events.uplink")
	<-ctx.Done()
}
