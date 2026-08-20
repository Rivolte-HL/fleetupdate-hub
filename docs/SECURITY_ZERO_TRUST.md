# Zero-Trust Security Architecture (FleetUpdate-Hub)

This document details the threat model, cryptographic primitives, network segmentation, and security directives enforced in **FleetUpdate-Hub**.

---

## 1. Threat Model & Guiding Principles

A centralized infrastructure update orchestrator is a high-value target: compromising the orchestrator could allow malicious payloads to be propagated across the managed infrastructure.

To eliminate this vulnerability vector, **FleetUpdate-Hub** enforces three non-negotiable principles:
1. **Anti-Circularity Golden Rule:** FleetUpdate-Hub must **never** manage its own update cycle or its immediate host infrastructure.
2. **Network Segmentation:** The PostgreSQL database resides in an unrouted Docker bridge network (`internal-net`).
3. **Zero-Trust Storage at Rest:** No private keys, API tokens, or secrets are stored in plaintext in the database or execution logs.

---

## 2. Cryptographic Secrets Vault (AES-256-GCM)

All target credential records (SSH private keys, API tokens, API secrets) are encrypted at rest using **AES-256-GCM** (Galois/Counter Mode):

* **Master Key:** 256 bits (32 bytes / 64 hex characters), injected via the `MASTER_ENCRYPTION_KEY` environment variable or Docker Secret file `/run/secrets/master_key`.
* **Initialization Vector (IV):** 96 bits (12 bytes) cryptographically randomly generated per encryption operation, ensuring two encryptions of the same plaintext produce unique ciphertexts.
* **Authentication Tag:** 128 bits (16 bytes) providing authenticated encryption. Any tampering or bit-flipping in PostgreSQL triggers an immediate decryption rejection.

Database storage format:
```
<IV_HEX>:<AUTH_TAG_HEX>:<CIPHERTEXT_HEX>
```

---

## 3. Principle of Least Privilege on Target Hosts

Accounts created on target systems must **never** hold blanket `root` or full administrative privileges.

### Target Setup Specifications:

#### 1. Proxmox VE
* **User:** `fleetupdate@pve`
* **API Token:** `fleetupdate@pve!update-agent`
* **Restricted Role:** `Sys.Audit`, `VM.Audit`, `VM.Backup`, `VM.Snapshot`, `VM.Snapshot.Rollback` (no terminal shell or network reconfiguration access).
* **SSH Account:** Dedicated `fleetupdate` user with sudo restricted strictly to `apt-get` and `reboot`.

#### 2. OPNsense
* **API User:** `fleetupdate`
* **Privilege:** Strictly the single `System: Firmware` privilege (`/api/core/firmware/*`).

#### 3. Linux Servers & VMs (Agentless SSH)
* **Service Account:** `fleetupdate`
* **Authentication:** Passwordless `Ed25519` SSH key.
* **Restricted Sudoers (`/etc/sudoers.d/fleetupdate`):**
  ```sudoers
  fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get, /usr/bin/dnf, /usr/bin/yum, /usr/bin/pacman, /sbin/apk, /usr/bin/zypper, /sbin/reboot, /usr/sbin/reboot, /bin/systemctl
  ```

---

## 4. Web Console Authentication & Session Security

* **JWT Tokens:** Transmitted strictly in `HttpOnly`, `SameSite=Strict`, and `Secure` (in production) cookies.
* **Two-Factor Authentication (2FA / TOTP):** RFC 6238 compliant (20-byte Base32-encoded shared secret).
* **CSRF Mitigation:** Double-submit cookie verification for state-mutating requests (`POST`, `PUT`, `DELETE`).
* **Rate Limiting:** Sliding-window rate limiting on sensitive routes (`/api/auth/login`: 5 attempts per IP per minute).

