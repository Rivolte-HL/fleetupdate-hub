#!/bin/sh
set -e

KEYS_DIR="${SSH_KEY_DIR:-/app/keys}"
mkdir -p "$KEYS_DIR" 2>/dev/null || true

# 1. Database Connection URL
if [ -n "$DATABASE_URL_FILE" ] && [ -f "$DATABASE_URL_FILE" ]; then
  export DATABASE_URL="$(cat "$DATABASE_URL_FILE")"
elif [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://fleet_user:fleet_password_change_me@db:5432/fleetupdate?schema=public"
fi

# 2. Master Encryption Key (AES-256)
if [ -n "$MASTER_ENCRYPTION_KEY_FILE" ] && [ -f "$MASTER_ENCRYPTION_KEY_FILE" ]; then
  export MASTER_ENCRYPTION_KEY="$(cat "$MASTER_ENCRYPTION_KEY_FILE")"
elif [ -z "$MASTER_ENCRYPTION_KEY" ]; then
  PERSISTENT_KEY_FILE="$KEYS_DIR/master_key.secret"
  if [ -f "$PERSISTENT_KEY_FILE" ]; then
    export MASTER_ENCRYPTION_KEY="$(cat "$PERSISTENT_KEY_FILE")"
  else
    export MASTER_ENCRYPTION_KEY="$(openssl rand -hex 32)"
    echo -n "$MASTER_ENCRYPTION_KEY" > "$PERSISTENT_KEY_FILE" 2>/dev/null || true
    echo "======================================================================"
    echo "🔐 [Zero-Trust] Clé maîtresse AES-256 générée automatiquement :"
    echo "Clé : $MASTER_ENCRYPTION_KEY"
    echo "Fichier de persistance : $PERSISTENT_KEY_FILE"
    echo "Conservez cette clé pour vos sauvegardes hors-ligne !"
    echo "======================================================================"
  fi
fi

# 3. JWT Secret
if [ -n "$JWT_SECRET_FILE" ] && [ -f "$JWT_SECRET_FILE" ]; then
  export JWT_SECRET="$(cat "$JWT_SECRET_FILE")"
elif [ -z "$JWT_SECRET" ]; then
  PERSISTENT_JWT_FILE="$KEYS_DIR/jwt_secret.secret"
  if [ -f "$PERSISTENT_JWT_FILE" ]; then
    export JWT_SECRET="$(cat "$PERSISTENT_JWT_FILE")"
  else
    export JWT_SECRET="$(openssl rand -hex 32)"
    echo -n "$JWT_SECRET" > "$PERSISTENT_JWT_FILE" 2>/dev/null || true
  fi
fi

echo "⏳ Synchronizing PostgreSQL schema with Prisma..."
npx prisma db push --skip-generate

echo "🚀 Launching FleetUpdate-Hub server..."
exec "$@"
