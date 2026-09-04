# Security Policy

Security, confidentiality, and zero-trust isolation are foundational pillars of **FleetUpdate-Hub**. This document outlines our vulnerability disclosure process, supported versions, and built-in security directives.

---

## 🛡️ Supported Versions

Only the latest active release stream receives security updates and vulnerability patches:

| Version | Support Status |
| :--- | :--- |
| `1.0.x` (main) | :white_check_mark: Active (Priority security fixes) |
| `< 1.0.0` | :x: End of Life / Unsupported |

---

## 🚨 Reporting a Vulnerability (Responsible Disclosure)

If you identify a potential security vulnerability in FleetUpdate-Hub:

1. **Do NOT open a public GitHub Issue.**
2. Use **GitHub Private Security Advisories** directly under the **Security > Advisories > Report a vulnerability** tab of this repository.
3. Alternatively, reach out directly to the maintainers through a private channel or encrypted email.

### What to include in your advisory:
* Vulnerability category (e.g. Injection, Authentication bypass, SSRF, Broken Access Control, Privilege Escalation).
* Affected component or file path (e.g. `backend/src/core/encryption.service.ts`, `auth.controller.ts`, etc.).
* Step-by-step reproduction steps or Proof-of-Concept (PoC).
* Assessed severity and potential impact (estimated CVSS v3/v4 score).

### Response SLA:
* **Initial Acknowledgment:** Within 48 business hours.
* **Triage & Reproduction Confirmation:** Within 5 business days.
* **Security Patch Release & Public Advisory:** Within 14–30 business days depending on critical severity.

---

## 🔒 Built-in Zero-Trust Security Controls

FleetUpdate-Hub is engineered with defense-in-depth security defaults:
* **AES-256-GCM Encryption at Rest:** All credentials (SSH keys, tokens, passwords) stored in PostgreSQL use unique 96-bit random IVs and 128-bit authentication tags to prevent tampering.
* **Master Key Isolation:** `MASTER_ENCRYPTION_KEY` is never persisted in source control or configuration files; it is injected at runtime via environment variables or Docker Secrets (`/run/secrets/master_key`).
* **Principle of Least Privilege:** Setup scripts and target adapters require minimal scoped permissions (e.g. Proxmox `FleetUpdateRole`, OPNsense `System: Firmware`).
* **Hardened Web Sessions:** Session tokens are delivered via `HttpOnly`, `SameSite=Strict`, `Secure` cookies with double-submit CSRF protection.
* **Two-Factor Authentication (MFA / 2FA):** Native RFC 6238 TOTP support (Google Authenticator, Bitwarden, FreeOTP, Aegis).

