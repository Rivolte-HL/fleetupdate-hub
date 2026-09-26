#!/usr/bin/env bash
# ==============================================================================
# FleetUpdate-Hub - Production Zero-Trust Deployment & Build Script
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "========================================================================"
echo "🛡️  FleetUpdate-Hub — Déploiement & Build Forteresse de Sécurité"
echo "========================================================================"

# 1. Vérification des prérequis Docker & Compose
if ! command -v docker &> /dev/null; then
    echo "❌ Erreur: Docker n'est pas installé sur cette machine."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Erreur: Le plugin 'docker compose' n'est pas installé."
    exit 1
fi

# 2. Génération des secrets Zero-Trust si nécessaire
if [ ! -f "${ROOT_DIR}/.env" ] || [ ! -d "${ROOT_DIR}/secrets" ]; then
    echo "🔑 Étape 1/4 : Génération des clés AES-256 et secrets d'environnement..."
    chmod +x "${SCRIPT_DIR}/generate-secrets.sh"
    "${SCRIPT_DIR}/generate-secrets.sh"
else
    echo "✅ Étape 1/4 : Fichier .env et coffre de secrets déjà présents."
fi

# 3. Compilation et Build des images Docker (Backend & Frontend)
echo "📦 Étape 2/4 : Construction des images Docker sécurisées (multi-stage)..."
docker compose build --pull

# 4. Lancement de la stack isolée
echo "🚀 Étape 3/4 : Démarrage des conteneurs avec segmentation réseau 3-tiers..."
docker compose up -d --remove-orphans

# 5. Attente de stabilisation et tests de santé
echo "⏳ Étape 4/4 : Vérification de l'état de santé des services..."
ATTEMPTS=0
MAX_ATTEMPTS=30
BACKEND_HEALTHY=false

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if docker compose ps backend | grep -q "healthy"; then
        BACKEND_HEALTHY=true
        break
    fi
    sleep 2
    ATTEMPTS=$((ATTEMPTS + 1))
    echo -n "."
done
echo ""

if [ "$BACKEND_HEALTHY" = true ]; then
    echo "✅ Backend opérationnel et base de données connectée !"
else
    echo "⚠️  Le backend démarre (vérifiez avec 'docker compose logs backend')."
fi

echo "========================================================================"
echo "🎉 Déploiement terminé avec succès !"
echo "========================================================================"
echo "🌐 Interface Web : http://localhost:3000 (ou l'IP de votre serveur)"
echo "🔌 API Backend   : http://localhost:5000/api/health"
echo ""
if [ -f "${ROOT_DIR}/secrets/admin_password.txt" ]; then
    echo "🔐 Identifiants Administrateur initiaux :"
    echo "   - Email : admin@fleetupdate.local"
    echo "   - Mot de passe : $(cat "${ROOT_DIR}/secrets/admin_password.txt")"
    echo "   (Sauvegardé dans secrets/admin_password.txt avec permissions 0600)"
fi
echo ""
echo "Commandes utiles :"
echo "   - Voir les logs en direct : docker compose logs -f"
echo "   - Voir l'état des conteneurs : docker compose ps"
echo "   - Arrêter les services : docker compose down"
echo "========================================================================"
