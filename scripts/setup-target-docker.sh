#!/usr/bin/env bash
# ==============================================================================
# FleetUpdate-Hub - Docker Host mTLS / TLS Daemon Setup Helper
# Run on target Docker host as root
# ==============================================================================
set -euo pipefail

TARGET_DIR="/etc/docker/certs"
mkdir -p "$TARGET_DIR"
chmod 700 "$TARGET_DIR"

echo "🐳 Docker TLS Host Configuration Helper for FleetUpdate-Hub"

HOST_IP=$(hostname -I | awk '{print $1}')
echo "Detected Host IP: ${HOST_IP}"

# Optional: Generate self-contained CA, server, and client certificates if not present
if [ ! -f "$TARGET_DIR/ca.pem" ]; then
    echo "🔑 Generating self-signed mTLS certificates in $TARGET_DIR..."
    cd "$TARGET_DIR"

    # 1. CA
    openssl genrsa -out ca-key.pem 4096 2>/dev/null
    openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -out ca.pem -subj "/CN=FleetUpdate-Docker-CA" 2>/dev/null

    # 2. Server Key & Cert
    openssl genrsa -out server-key.pem 4096 2>/dev/null
    openssl req -subj "/CN=${HOST_IP}" -sha256 -new -key server-key.pem -out server.csr 2>/dev/null
    echo "subjectAltName = DNS:localhost,IP:127.0.0.1,IP:${HOST_IP}" > extfile.cnf
    echo "extendedKeyUsage = serverAuth" >> extfile.cnf
    openssl x509 -req -days 3650 -sha256 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile extfile.cnf 2>/dev/null

    # 3. Client Key & Cert (for FleetUpdate-Hub)
    openssl genrsa -out client-key.pem 4096 2>/dev/null
    openssl req -subj '/CN=fleetupdate-client' -new -key client-key.pem -out client.csr 2>/dev/null
    echo "extendedKeyUsage = clientAuth" > extfile-client.cnf
    openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out client-cert.pem -extfile extfile-client.cnf 2>/dev/null

    rm -f client.csr server.csr extfile.cnf extfile-client.cnf
    chmod 400 ca-key.pem server-key.pem client-key.pem
    chmod 444 ca.pem server-cert.pem client-cert.pem
    echo "✅ Certificates successfully generated in $TARGET_DIR!"
fi

echo ""
echo "📋 Next Steps for /etc/docker/daemon.json:"
cat << EOF
{
  "tlsverify": true,
  "tlscacert": "/etc/docker/certs/ca.pem",
  "tlscert": "/etc/docker/certs/server-cert.pem",
  "tlskey": "/etc/docker/certs/server-key.pem",
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"]
}

Then reload and restart docker:
  systemctl daemon-reload && systemctl restart docker

In FleetUpdate-Hub, paste:
  Endpoint: https://${HOST_IP}:2376
  caCert: (Content of ca.pem)
  clientCert: (Content of client-cert.pem)
  clientKey: (Content of client-key.pem)

==============================================================================
Option B: HTTPS Reverse Proxy with Password (HTTP Basic Auth)
==============================================================================
If you use Nginx / Traefik / Caddy / docker-socket-proxy with Basic Auth:
  Endpoint: https://docker-proxy.yourdomain.com (or https://${HOST_IP}:port)
  Nom d'utilisateur: (Your basic auth username)
  Mot de passe: (Your basic auth password)
EOF
