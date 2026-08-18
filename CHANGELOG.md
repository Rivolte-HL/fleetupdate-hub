# Journal des Modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont consignées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet adhère au [Versionnement Sémantique (SemVer)](https://semver.org/lang/fr/).

---

## [1.0.0] - 2026-08-18

### Ajouté
* **Architecture Modulaire Multi-Adaptateurs :**
  * Adaptateur **Proxmox VE** (API PVEAPIToken, gestion des snapshots QEMU/LXC, sauvegardes vzdump protégées).
  * Adaptateur **Proxmox Backup Server** (PBS Token, gestion des datastores et vérifications).
  * Adaptateur **OPNsense** (API REST MVC, mise à niveau de firmware, vérification du redémarrage).
  * Adaptateur **Docker Multi-Hôtes** (Sockets TLS/SSH, comparaison de hashs SHA256, extraction des release notes GitHub via étiquettes OCI, rollback sous 60s).
  * Adaptateur **Linux SSH Agentless** (Gestionnaires APT, DNF, Pacman, détection de `/var/run/reboot-required`).
  * Adaptateur **Home Assistant** (Long-Lived Access Tokens, entités `update.*`, sauvegarde automatique Supervisor).
* **Coffre-fort de Secrets & Sécurité Zero-Trust :**
  * Service de chiffrement cryptographique **AES-256-GCM** avec vecteur d'initialisation (IV 96-bit) et tag d'authentification (128-bit).
  * Authentification des sessions via cookies `HttpOnly`, protection contre les attaques CSRF, et authentification à deux facteurs (**2FA TOTP**).
  * Contrôle d'accès basé sur les rôles (**RBAC**) : `ADMIN`, `OPERATOR`, `VIEWER`.
  * Traçabilité immuable dans les journaux d'audit (`audit_logs`).
* **Pipeline d'Exécution Résilient en 5 Étapes :**
  * 1. Contrôle de pré-vol (*Pre-Flight Check*).
  * 2. Création du snapshot ou de la sauvegarde de sécurité.
  * 3. Application de la mise à jour.
  * 4. Validation post-déploiement (*Health Check*).
  * 5. Validation ou Déclenchement du Rollback automatique avec notifications Discord / Telegram.
* **Interface Utilisateur Moderne & Réactive :**
  * Dashboard de surveillance en temps réel avec WebSockets.
  * Génération dynamique des formulaires de configuration selon les métadonnées de l'adaptateur.
  * Modales interactives de tutoriels d'onboarding sécurisé pour chaque type de cible.
  * Visualiseur de changelogs et journaux d'audit filtrables.
* **Infrastructure & Déploiement :**
  * Déploiement multi-conteneurs Docker Compose avec isolation réseau étanche (`internal-net` et `mgmt-net`).
  * Script d'automatisation des secrets (`scripts/generate-secrets.sh` et `generate-secrets.ps1`).
  * Scripts d'onboarding cible à droits restreints (`setup-target-*.sh`).
