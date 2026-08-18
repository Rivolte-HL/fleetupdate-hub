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

echo ""
echo "======================================================================"
echo "⚠️  IMPORTANT: SAUVEGARDEZ HORS-LIGNE VOTRE CLÉ MAÎTRESSE :"
echo "Clé AES-256 : $MASTER_KEY"
echo "Conservez cette clé dans votre gestionnaire de mots de passe (KeePass/Vaultwarden)."
echo "En cas de perte, les identifiants chiffrés en base seront irrécupérables."
echo "======================================================================"
