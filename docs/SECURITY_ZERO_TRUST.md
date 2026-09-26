# Zero-Trust Security Architecture (FleetUpdate-Hub)

This document details the threat model, cryptographic primitives, network segmentation, and defensive controls implemented across **FleetUpdate-Hub**.

---

## 1. Threat Model & Guiding Principles

A centralized infrastructure update orchestrator is a high-value operational target: compromising the orchestrator could allow unauthorized software payloads or destructive actions across the entire infrastructure.

To eliminate this vulnerability vector, **FleetUpdate-Hub** enforces core defensive rules:
1. **Anti-Circularity Golden Rule:** FleetUpdate-Hub **never** manages its own update cycle or its immediate host infrastructure. Self-updates must be performed via controlled Docker Compose pulls.
2. **Network Segmentation:** The PostgreSQL database resides in an unrouted Docker bridge network (`internal-net`) inaccessible from external networks.
3. **Zero-Trust Storage at Rest:** No private keys, API tokens, or secrets are stored in plaintext in the database or logs.
4. **Outbound-Only Integrations:** External systems (like Home Assistant) never establish incoming network connections to FleetUpdate-Hub.

---

## 2. Cryptographic Secrets Vault (AES-256-GCM)

All target credential records (SSH private keys, API tokens, API secrets, passwords) are encrypted at rest using **AES-256-GCM** (Galois/Counter Mode) via [encryption.service.ts](file:///c:/Users/Thomas/.gemini/antigravity-ide/scratch/fleetupdate-hub/backend/src/core/encryption.service.ts):

* **Master Key:** 256 bits (32 bytes / 64 hex characters), injected via the `MASTER_ENCRYPTION_KEY` environment variable or Docker Secret file `/run/secrets/master_key`.
* **Initialization Vector (IV):** 96 bits (12 bytes) cryptographically randomly generated (`crypto.randomBytes(12)`) per encryption operation.
* **Authentication Tag:** 128 bits (16 bytes) providing authenticated encryption (AEAD). Any tampering or bit-flipping triggers an immediate decryption rejection before plaintext extraction.
* **Key Derivation (KDF):** If the key is provided as a textual passphrase, it is derived via PBKDF2 with 100,000 iterations of SHA-256.
* **Secure Memory Hygiene:** Sensitive IV and authentication tag buffers are actively zeroed out (`buffer.fill(0)`) after cryptographic operations.

Database storage format:
```
<IV_HEX>:<AUTH_TAG_HEX>:<CIPHERTEXT_HEX>
```

---

## 3. Session Security & Instant Token Revocation

* **HttpOnly Cookies:** Authentication tokens are stored exclusively in `HttpOnly`, `SameSite=Strict`, and `Secure` (in production) cookies, completely mitigating XSS token theft.
* **Immediate Session Invalidation (`tokenVersion`):**
  Every user profile maintains an incrementing `tokenVersion` counter in PostgreSQL. Whenever a user changes their password or updates their 2FA settings, `tokenVersion` is incremented. The authentication middleware immediately rejects any previously issued JWTs bearing an older version, terminating active sessions across all devices instantaneously.
* **Timing-Safe Token Comparisons:** Webhook tokens, 2FA validation codes, and cryptographic signatures are verified using `crypto.timingSafeEqual` to prevent side-channel timing analysis attacks.
* **Two-Factor Authentication (2FA / TOTP):** RFC 6238 compliant TOTP, with secrets encrypted at rest in the database using AES-256-GCM.

---

## 4. Home Assistant Air-Gap Architecture (Outbound Model)

Homelab setups frequently expose Home Assistant to the internet via Cloudflare Tunnels, reverse proxies, or Nabu Casa. To prevent a compromised Home Assistant instance from pivoting into the update orchestrator:

```mermaid
flowchart LR
    subgraph FleetUpdateZone ["FleetUpdate-Hub Core (Protected LAN)"]
        FUHub["FleetUpdate-Hub Backend"]
    end

    subgraph HAZone ["Home Assistant (External / DMZ)"]
        HA["Home Assistant Core & WebGUI"]
    end

    FUHub -->|1. REST POST /api/states (Entity Push)| HA
    FUHub -->|2. Outbound Client WebSocket (/api/websocket)| HA
    HA -.->|INBOUND CONNECTIONS STRICTLY FORBIDDEN (No Open Ports)| FUHub
```

1. **Strictly Outbound:** FleetUpdate-Hub acts as an HTTP and WebSocket **client** toward Home Assistant. Home Assistant never connects back into FleetUpdate-Hub.
2. **Armed / Disarmed Safety Gate:** If `allowHaTrigger` is `false` (default mode), update requests intercepted over the WebSocket are discarded.
3. **State Pre-Validation:** Even when armed, FleetUpdate-Hub validates whether the targeted host has verified updates in its local database before taking any action.

---

## 5. Principle of Least Privilege on Target Hosts

Accounts created on target systems must operate with minimal permissions:

| Platform | Recommended Role / User | Permissions & Scope |
| :--- | :--- | :--- |
| **Proxmox VE** | `fleetupdate@pve` (API Token) | `Sys.Audit`, `VM.Audit`, `VM.Backup`, `VM.Snapshot`, `VM.Snapshot.Rollback` |
| **PBS** | `fleetupdate@pbs` (API Token) | `Datastore.Audit`, `Sys.Audit` |
| **OPNsense** | `fleetupdate-svc` (API Key) | `System: Firmware` strictly |
| **TrueNAS SCALE** | Dedicated API Key (Bearer) | ZFS snapshot execution and application upgrade scope |
| **Linux SSH** | `fleetupdate` (Ed25519 Key) | Sudoers restricted exclusively to package managers (`apt-get`, `dnf`, etc.) |
| **Docker** | HTTPS Socket / mTLS | Docker Engine API with TLS client certificate authentication |
| **Home Assistant** | Dedicated LLAT | Native `update` domain and supervisor backup privileges |
