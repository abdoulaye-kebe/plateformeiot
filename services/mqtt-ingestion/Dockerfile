FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /mqtt-ingestion ./cmd/worker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /mqtt-ingestion /mqtt-ingestion
ENTRYPOINT ["/mqtt-ingestion"]
