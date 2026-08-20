port ${OVPN_PORT}
proto udp
dev tun
ca /pki/easy-rsa/pki/ca.crt
cert /pki/easy-rsa/pki/issued/server.crt
key /pki/easy-rsa/pki/private/server.key
dh /pki/easy-rsa/pki/dh.pem
tls-auth /pki/easy-rsa/pki/ta.key 0
topology subnet
server ${OVPN_NET} ${OVPN_MASK}
ifconfig-pool-persist /pki/ipp.txt
keepalive 10 120
cipher AES-256-GCM
auth SHA256
user nobody
group nobody
persist-key
persist-tun
status /pki/openvpn-status.log
verb 3
explicit-exit-notify 1
script-security 2
up /etc/openvpn/up-relay.sh
