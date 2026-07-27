package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lorawan-platform/mqtt-ingestion/internal/archive"
	"github.com/lorawan-platform/mqtt-ingestion/internal/config"
	"github.com/lorawan-platform/mqtt-ingestion/internal/ingest"
	"github.com/lorawan-platform/mqtt-ingestion/internal/mqttclient"
	"github.com/lorawan-platform/mqtt-ingestion/internal/natsbus"
	"github.com/lorawan-platform/mqtt-ingestion/internal/store"
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

	var publisher ingest.EventPublisher
	if cfg.NATSURL != "" {
		nc, err := natsbus.Connect(cfg.NATSURL)
		if err != nil {
			logger.Warn("nats unavailable", "error", err)
		} else {
			defer nc.Close()
			publisher = natsbus.NewPublisher(nc)
		}
	}

	var payloadArchiver ingest.PayloadArchiver
	if cfg.MinIOAccessKey != "" {
		minioClient, err := archive.New(archive.Config{
			Endpoint:  cfg.MinIOEndpoint,
			AccessKey: cfg.MinIOAccessKey,
			SecretKey: cfg.MinIOSecretKey,
			Bucket:    cfg.MinIOBucket,
			UseSSL:    cfg.MinIOUseSSL,
		}, logger)
		if err != nil {
			logger.Warn("minio unavailable", "error", err)
		} else {
			payloadArchiver = archive.NewMinioPayloadArchiver(minioClient, store.NewPayloadArchiveStore(db))
			logger.Info("minio payload archive enabled", "bucket", cfg.MinIOBucket)
		}
	}

	handler := ingest.NewHandler(store.NewUplinkStore(db), store.NewGatewayStore(db), publisher, payloadArchiver, store.NewTenantResolver(db), cfg.Region, logger)
	client := mqttclient.New(cfg.MQTTBrokerURL, cfg.MQTTClientID, cfg.Topics, handler.Handle, logger)

	if err := client.Connect(); err != nil {
		logger.Error("mqtt connect failed", "error", err)
		os.Exit(1)
	}
	defer client.Disconnect(250)

	logger.Info("mqtt-ingestion started", "broker", cfg.MQTTBrokerURL, "topics", cfg.Topics)
	<-ctx.Done()
	logger.Info("shutting down")
	time.Sleep(300 * time.Millisecond)
}
