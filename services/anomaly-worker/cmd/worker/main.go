package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lorawan-platform/anomaly-worker/internal/config"
	"github.com/lorawan-platform/anomaly-worker/internal/detector"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	det := detector.New(pool, logger)
	ticker := time.NewTicker(time.Duration(cfg.IntervalSec) * time.Second)
	defer ticker.Stop()

	logger.Info("anomaly-worker started", "intervalSec", cfg.IntervalSec)

	run := func() {
		if err := det.Run(ctx); err != nil {
			logger.Error("detection run failed", "error", err)
		}
	}
	run()

	for {
		select {
		case <-ctx.Done():
			logger.Info("shutting down")
			return
		case <-ticker.C:
			run()
		}
	}
}
