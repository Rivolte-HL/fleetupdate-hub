#!/usr/bin/env bash
# ==============================================================================
# FleetUpdate-Hub - Secrets Generator for Production
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$ROOT_DIR/secrets"

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

echo "🔐 Generating cryptographic secrets for FleetUpdate-Hub..."

# 1. Generate Database Password
DB_PASS=$(openssl rand -hex 24)
echo -n "$DB_PASS" > "$SECRETS_DIR/db_password.txt"
chmod 600 "$SECRETS_DIR/db_password.txt"
echo "  [OK] Database password generated in secrets/db_password.txt"

# 2. Generate Master Encryption Key (32 bytes = 256 bits, represented as 64 hex characters)
MASTER_KEY=$(openssl rand -hex 32)
echo -n "$MASTER_KEY" > "$SECRETS_DIR/master_key.txt"
chmod 600 "$SECRETS_DIR/master_key.txt"
echo "  [OK] AES-256 Master Key generated in secrets/master_key.txt"

# 3. Generate JWT Secret
JWT_SEC=$(openssl rand -hex 32)
echo -n "$JWT_SEC" > "$SECRETS_DIR/jwt_secret.txt"
chmod 600 "$SECRETS_DIR/jwt_secret.txt"
echo "  [OK] JWT Secret generated in secrets/jwt_secret.txt"

# 4. Generate Connection URL for Docker internal network
DB_URL="postgresql://fleet_user:${DB_PASS}@db:5432/fleetupdate?schema=public"
echo -n "$DB_URL" > "$SECRETS_DIR/db_connection_url.txt"
chmod 600 "$SECRETS_DIR/db_connection_url.txt"
echo "  [OK] Database Connection URL generated in secrets/db_connection_url.txt"

# 5. Populate or Create .env file for Docker Compose
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF > "$ENV_FILE"
# ==============================================================================
# FleetUpdate-Hub - Auto-Generated Production Configuration
# ==============================================================================
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

POSTGRES_DB=fleetupdate
POSTGRES_USER=fleet_user
POSTGRES_PASSWORD=${DB_PASS}
DATABASE_URL=${DB_URL}

MASTER_ENCRYPTION_KEY=${MASTER_KEY}
JWT_SECRET=${JWT_SEC}
JWT_EXPIRES_IN=8h

CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

INITIAL_ADMIN_EMAIL=admin@fleetupdate.local
INITIAL_ADMIN_PASSWORD=
EOF
  chmod 600 "$ENV_FILE"
  echo "  [OK] Ready-to-use .env configuration file generated!"
else
  echo "  [INFO] Existing .env detected, preserved without overwriting."
fi

echo ""
echo "======================================================================"
echo "⚠️  IMPORTANT: SAVE YOUR MASTER ENCRYPTION KEY OFFLINE:"
echo "AES-256 Key: $MASTER_KEY"
echo "Store this key in your password manager (e.g. KeePass, Bitwarden, 1Password)."
echo "If lost, encrypted credentials stored in the database cannot be recovered."
echo "======================================================================"
echo "🚀 To launch the FleetUpdate-Hub stack:"
echo "   docker compose up -d"
echo "======================================================================"
