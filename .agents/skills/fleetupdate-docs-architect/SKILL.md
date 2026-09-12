---
name: fleetupdate-docs-architect
description: Use this skill when writing, auditing, updating, or synchronizing technical documentation (README, ARCHITECTURE, SECURITY_ZERO_TRUST, target setup guides, API specs) in FleetUpdate-Hub.
---

# FleetUpdate Technical Documentation Architect

This skill provides guidelines, architectural verification steps, and quality standards for maintaining all FleetUpdate-Hub technical documentation in alignment with the active codebase.

## 1. Documentation Inventory & Scope

FleetUpdate-Hub maintains the following core documentation files:
- **`README.md`**: Project overview, call for review, feature matrix, supported platforms, quick start, 5-phase pipeline diagram, and links.
- **`docs/ARCHITECTURE.md`**: Modular tier diagram (Client, Ingress, Core, Data, Target), Adapter pattern specifications, WebSocket log streaming, and database schema.
- **`docs/SECURITY_ZERO_TRUST.md`**: Cryptographic model (AES-256-GCM), token version session invalidation, least privilege target guides, anti-circularity rule.
- **`scripts/setup-target-*.md` & `.sh`**: Practical guides for each target platform (Proxmox VE, PBS, OPNsense, Docker, Linux SSH, Home Assistant, TrueNAS SCALE).
- **`SECURITY.md`**: Vulnerability disclosure policy and security contact.

## 2. Core Documentation Standards

### A. Language & Tone
- All public repository documentation is written in **professional English**.
- Clear, concise, and technically precise terminology (e.g., *Air-Gapped Zero-Trust*, *Deterministic 5-Phase Pipeline*, *AES-256-GCM Cryptographic Vault*).

### B. Synchronization with Code Truth
- **Never document hypothetical features as active**: Only document features that exist and are implemented in the codebase.
- **Adapters Matrix**: Ensure all 7 adapter types (`PROXMOX`, `PROXMOX_BACKUP_SERVER`, `OPNSENSE`, `DOCKER`, `LINUX_SSH`, `HOME_ASSISTANT`, `TRUENAS`) are accurately described with their exact protocols, auth methods, backup mechanisms, and rollback behaviors.
- **Home Assistant Dual-Role**: Clearly differentiate Home Assistant as a **Managed Target** (updating HA Core/OS/Supervisor) versus Home Assistant as an **Outbound Notification & Entity Sync Channel** (outbound WebSocket + REST push, zero inbound ports).

### C. Security Documentation
- Never expose real credentials, private IPs, or live tokens in examples (use RFC 1918 examples `192.168.1.100`, placeholders `eyJ...`, `key_xxx`).
- Accurately document encryption parameters: AES-256-GCM, 96-bit random IV, 128-bit authentication tag, PBKDF2 (100,000 iterations), and `timingSafeEqual`.

### D. Diagram Integrity
- Use standard GitHub-compliant Mermaid diagrams with proper syntax and quoted node labels when using parentheses.
