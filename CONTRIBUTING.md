# Contributing to FleetUpdate-Hub

Thank you for your interest in contributing to **FleetUpdate-Hub**! This document outlines guidelines and best practices for submitting issues, proposing features, and opening pull requests.

---

## 🧭 Guiding Principles

1. **Zero-Trust Security First:** All new integrations and patches must adhere to the principle of least privilege, systematic encryption of credentials at rest, and strict input validation.
2. **Quality & Test Coverage:** Every adapter or core service modification must include automated unit and regression tests.
3. **Modularity via the Adapter Pattern:** Never modify the core orchestrator (`pipeline.engine.ts`) to accommodate vendor-specific edge cases. Extend `BaseServiceAdapter` instead.

---

## 🛠️ Local Development Environment

### Prerequisites
* Node.js 20+ (Active LTS)
* npm 10+
* Docker & Docker Compose v2
* PostgreSQL 16 (or local container via `docker-compose.dev.yml`)

### Installation & Quick Start

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/Rivolte-HL/fleetupdate-hub.git
   cd fleetupdate-hub
   ```

2. **Start the development PostgreSQL container:**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. **Configure and start the Backend:**
   ```bash
   cd backend
   cp ../.env.example .env
   npm install
   npx prisma generate
   npx prisma migrate dev
   npm run dev
   ```

4. **Configure and start the Frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

---

## 🌿 Branching Strategy & Commit Conventions

### Git Branches
* `main`: Protected production branch.
* `feat/<feature-name>`: New capabilities or integration adapters.
* `fix/<bug-name>`: Bug fixes.
* `docs/<topic>`: Documentation enhancements.
* `refactor/<module>`: Code restructuring without functional changes.

### Conventional Commits
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

* `feat(adapter): add support for TrueNAS SCALE API`
* `fix(proxmox): resolve snapshot timeout on busy QEMU guests`
* `security(vault): enforce strict IV regeneration on rotation`
* `docs(readme): add troubleshooting guide for OPNsense TLS`
* `test(backend): add unit tests for Docker rollback sequence`

---

## 🧪 Validation & Checks Before Opening a Pull Request

Before opening a PR, ensure all checks pass locally:

```bash
# 1. Typecheck Backend & Frontend
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit

# 2. Run backend test suite
cd ../backend && npm test

# 3. Compile frontend production bundle
cd ../frontend && npm run build
```

---

## 📦 Adding a New Service Adapter

To build an update adapter for a new platform:
1. Create a directory in `backend/src/adapters/<service-name>/`.
2. Extend `BaseServiceAdapter` and implement all interface methods:
   - `checkVersion(host, credentials)`
   - `fetchChangelog(host, credentials)`
   - `createBackup(host, credentials)`
   - `applyUpdate(host, credentials, options)`
   - `healthCheck(host, credentials)`
   - `rollback(host, credentials, backupIdentifier)`
3. Define form metadata and fields in `getMetadata()`.
4. Register your class in `backend/src/core/service.registry.ts`.
5. Add unit tests in `backend/src/tests/`.
