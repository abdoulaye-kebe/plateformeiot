FROM alpine:3.20

RUN apk add --no-cache openvpn easy-rsa iptables ip6tables bash curl socat gettext

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY up-relay.sh /etc/openvpn/up-relay.sh
COPY server.conf.tpl /etc/openvpn/server.conf.tpl

RUN chmod +x /docker-entrypoint.sh /etc/openvpn/up-relay.sh

EXPOSE 1194/udp

ENTRYPOINT ["/docker-entrypoint.sh"]
