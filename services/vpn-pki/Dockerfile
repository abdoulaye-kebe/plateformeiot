FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache openvpn easy-rsa
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /vpn-pki ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache openvpn easy-rsa ca-certificates
COPY --from=build /vpn-pki /vpn-pki
ENTRYPOINT ["/vpn-pki"]
