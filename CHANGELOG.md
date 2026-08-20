# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-20

### Security & Hardening
* **Webhook Security:** Eliminated default static fallback secret in `WebhookController`; strictly enforce custom secret configured in database vault or environment variables.
* **Database Migrations:** Initialized formal Prisma versioned migrations (`prisma/migrations/20260820000000_init/migration.sql`) and configured deterministic deployment via `prisma migrate deploy`.
* **Multi-Arch Docker Images:** Added `linux/arm64` binary target in Prisma schema and enabled multi-arch image builds (`linux/amd64` and `linux/arm64`) in GitHub Actions GHCR publish workflow for full Raspberry Pi & ARM mini-PC compatibility.
* **1-Click Onboarding:** Enhanced secret generation scripts (`scripts/generate-secrets.sh` and `generate-secrets.ps1`) to automatically generate a complete, ready-to-use `.env` configuration for Docker Compose.

---

## [1.0.0] - 2026-08-18

### Added
* **Modular Multi-Platform Adapter Architecture:**
  * **Proxmox VE** Adapter (REST API PVEAPIToken, QEMU/LXC atomic snapshots, protected vzdump backups, and SSH package upgrades).
  * **Proxmox Backup Server (PBS)** Adapter (API Token, datastore verification, and OS upgrades).
  * **OPNsense** Adapter (MVC REST API, firmware upgrades, and reboot cycle verification).
  * **Multi-Host Docker** Adapter (TLS/mTLS/HTTPS sockets, SHA256 image digest matching, OCI labels, container recreation, 60s rollback).
  * **Linux SSH Agentless** Adapter (APT, DNF, Pacman, APK, Zypper, `/var/run/reboot-required` detection).
  * **Home Assistant** Adapter (Long-Lived Access Tokens, native `update.*` entities, automated Supervisor snapshots).
* **Zero-Trust Encrypted Secrets Vault:**
  * **AES-256-GCM** encryption service at rest with unique 96-bit random IVs and 128-bit authentication tags.
  * Hardened session authentication via `HttpOnly`, `SameSite=Strict` cookies, CSRF protection, and **2FA TOTP** (Google Authenticator, Bitwarden, FreeOTP, Aegis).
  * Role-Based Access Control (**RBAC**): `ADMIN`, `OPERATOR`, `VIEWER`.
  * Immutable event traceability in audit logs (`audit_logs`).
* **Resilient 5-Phase Execution Pipeline:**
  * 1. Pre-Flight Check (network latency, disk headroom, concurrent locks).
  * 2. Snapshot / Point-in-time Backup.
  * 3. Apply Package / Image / Firmware Update.
  * 4. Post-Deployment Health Check (ICMP, TCP, HTTP active probes).
  * 5. Finalize or Automatic Immediate Rollback with Webhook Dispatch.
* **Modern Internationalized Frontend (i18n):**
  * Real-time monitoring dashboard with live WebSocket updates.
  * In-app language switcher toggle (English 🇬🇧 / French 🇫🇷) with persistent preference caching.
  * Dynamic Adapter Form generation driven by backend adapter metadata.
  * Interactive security onboarding tutorial modals for each target host type.
  * Version transition pills (`v1 ➔ v2`) and Changelog modal viewer.
* **Infrastructure & Automation:**
  * Hardened Docker Compose setup with dual-tier network segmentation (`internal-net` and `mgmt-net`).
  * Cryptographic secret generation scripts (`scripts/generate-secrets.sh` and `generate-secrets.ps1`).
  * Target host setup automation scripts (`setup-target-*.sh`).

