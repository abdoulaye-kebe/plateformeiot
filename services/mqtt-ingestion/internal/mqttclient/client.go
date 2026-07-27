package mqttclient

import (
	"log/slog"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	client mqtt.Client
	topics []string
	logger *slog.Logger
}

func New(brokerURL, clientID string, topics []string, handler MessageHandler, logger *slog.Logger) *Client {
	opts := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(clientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetKeepAlive(30 * time.Second)

	opts.SetDefaultPublishHandler(func(_ mqtt.Client, msg mqtt.Message) {
		handler(msg.Topic(), msg.Payload())
	})

	return &Client{
		client: mqtt.NewClient(opts),
		topics: topics,
		logger: logger,
	}
}

func (c *Client) Connect() error {
	token := c.client.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		return token.Error()
	}
	if err := token.Error(); err != nil {
		return err
	}

	for _, topic := range c.topics {
		t := strings.TrimSpace(topic)
		if t == "" {
			continue
		}
		sub := c.client.Subscribe(t, 1, nil)
		if !sub.WaitTimeout(5 * time.Second) || sub.Error() != nil {
			c.logger.Warn("subscribe failed", "topic", t, "error", sub.Error())
		} else {
			c.logger.Info("subscribed", "topic", t)
		}
	}
	return nil
}

func (c *Client) Disconnect(ms uint) { c.client.Disconnect(ms) }
