FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /device-connectivity ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /device-connectivity /device-connectivity
EXPOSE 1884 5683/udp
ENTRYPOINT ["/device-connectivity"]
