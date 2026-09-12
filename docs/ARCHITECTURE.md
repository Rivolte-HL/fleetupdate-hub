# 🏛️ FleetUpdate-Hub Architecture & System Design

## 1. Executive Overview & Problem Statement

Modern enterprise infrastructures and homelabs operate a heterogeneous mix of virtualization hypervisors, hardware firewalls, storage appliances, container engines, and agentless operating systems.

Prior to **FleetUpdate-Hub**, updating such infrastructure was fragmented across disparate management silos:
- Hypervisors (**Proxmox VE & PBS**) required manual snapshots and terminal package upgrades.
- Storage appliances (**TrueNAS SCALE**) required separate attention for base OS updates versus containerized application upgrades.
- Firewalls (**OPNsense**) required navigating separate web interfaces and handling reboot cycles manually.
- Container hosts (**Docker Engine**) required image digest auditing, container recreating, and risky manual rollbacks.
- Agentless Linux servers (**Debian, Ubuntu, RHEL, Arch, Alpine, openSUSE**) required custom SSH scripts without standardized verification.
- Smart home hubs (**Home Assistant**) required careful coordination between Core/OS updates and automated Supervisor snapshots.

**FleetUpdate-Hub** unifies everything into a single, secure (**Zero-Trust**), modular (**Adapter Pattern**), and resilient (**Automated 5-Phase Rollback Pipeline**) management platform.

---

## 2. Global System Architecture

The platform is structured into clean modular tiers:

```mermaid
flowchart TB
    subgraph ClientTier ["Administration & Notification Layer"]
        Browser["Admin Web Console (React 18 / Vite / TS / Tailwind)"]
        MobileHA["Home Assistant Mobile Companion (Actionable Push)"]
        ChatOps["ChatOps & Webhooks (Discord, Telegram, Nextcloud Talk)"]
    end

    subgraph IngressTier ["Ingress & Reverse Proxy"]
        Nginx["Nginx Reverse Proxy (Port 80 / 3000)"]
    end

    subgraph AppTier ["FleetUpdate-Hub Core (Node.js 20 / TypeScript)"]
        Express["Express REST API (Port 5000)"]
        WSServer["WebSocket Server (/ws/pipeline)"]
        AuthSvc["Auth & RBAC (JWT Cookies + 2FA TOTP + tokenVersion)"]
        VaultSvc["AES-256-GCM Vault Service"]
        Engine["5-Phase Pipeline Orchestration Engine"]
        Scheduler["Hourly Infrastructure Auto-Checker"]
        NotificationDispatcher["Multi-Channel Notification Dispatcher"]
        HASync["Home Assistant Outbound Sync & WebSocket Watcher"]

        subgraph Adapters ["Service Adapters (Hexagonal Pattern)"]
            PVEAdapter["Proxmox VE Adapter"]
            PBSAdapter["Proxmox Backup Server Adapter"]
            TrueNASAdapter["TrueNAS SCALE Adapter"]
            OPNAdapter["OPNsense Adapter"]
            DockerAdapter["Docker Multi-Host Adapter"]
            LinuxAdapter["Linux SSH Agentless Adapter"]
            HAAdapter["Home Assistant Adapter"]
        end
    end

    subgraph DataTier ["Data & Secrets Layer (internal-net)"]
        Postgres[(PostgreSQL 16 Database)]
        MasterKey[("Master Key (/run/secrets/master_key)")]
    end

    subgraph TargetTier ["Target Managed Infrastructure (mgmt-net)"]
        PVECluster["Proxmox VE Cluster (8006 / SSH)"]
        PBSNode["PBS Datastore (8007 / SSH)"]
        TrueNASNode["TrueNAS SCALE NAS (443 / API v2.0)"]
        OPNNode["OPNsense Firewall (443 / 8443)"]
        DockerNodes["Docker Daemons (TCP / TLS / Sockets)"]
        LinuxServers["Linux VMs & Servers (SSH Ed25519)"]
        HANode["Home Assistant Hub (8123)"]
    end

    Browser -->|HTTPS API & HttpOnly Cookies| Nginx
    Browser -.->|WebSocket Logs /ws/pipeline| Nginx
    Nginx --> Express
    Nginx -.-> WSServer

    Express --> AuthSvc
    Express --> Engine
    Express --> Scheduler
    Engine --> VaultSvc
    Engine --> WSServer
    Engine --> NotificationDispatcher
    NotificationDispatcher -.->|Alerts & Actionable Webhooks| ClientTier
    HASync -->|Outbound REST & WS Client| HANode

    VaultSvc --> MasterKey
    Express --> Postgres
    Engine --> Postgres

    Engine --> Adapters
    PVEAdapter -->|HTTPS REST & SSH| PVECluster
    PBSAdapter -->|HTTPS REST & SSH| PBSNode
    TrueNASAdapter -->|REST API v2.0| TrueNASNode
    OPNAdapter -->|Core REST API| OPNNode
    DockerAdapter -->|Engine API| DockerNodes
    LinuxAdapter -->|Agentless SSH| LinuxServers
    HAAdapter -->|Supervisor REST| HANode
```

---

## 3. Adapter Pattern & Supported Platforms

All target platforms implement the abstract `BaseServiceAdapter` contract managed by the singleton `ServiceRegistry`:

```typescript
export abstract class BaseServiceAdapter {
  abstract getMetadata(): AdapterMetadata;
  abstract checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo>;
  abstract fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]>;
  abstract createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult>;
  abstract applyUpdate(host: Host, credentials: TargetCredentials, onProgress?: (step: string, log: string) => void): Promise<UpdateExecutionResult>;
  abstract healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult>;
  abstract rollback(host: Host, credentials: TargetCredentials, backupIdentifier: string, onProgress?: (step: string, log: string) => void): Promise<RollbackResult>;
}
```

### Supported Integration Adapters:

| Adapter | Target Type | Protocol / Auth | Backup & Safety Mechanism | Upgrade Action & Rollback |
| :--- | :--- | :--- | :--- | :--- |
| **Proxmox VE** | `PROXMOX` | `PVEAPIToken` + SSH | QEMU/LXC atomic snapshots or `vzdump` | SSH `apt-get dist-upgrade`; hypervisor kernel restore via GRUB checkpoint |
| **PBS** | `PROXMOX_BACKUP_SERVER` | `PBSAPIToken` + SSH | Background task & GC lock audit | SSH `apt-get dist-upgrade` & datastore integrity verification |
| **TrueNAS SCALE** | `TRUENAS` | API Key (Bearer) / Basic | ZFS safety snapshot (`boot-pool` or custom dataset) + Config DB archive | REST API v2.0 OS upgrade & Docker/Helm app updates; ZFS rollback |
| **Docker Engine** | `DOCKER` | TCP, HTTPS, or mTLS socket | Image tag retention (`fleetupdate-backup:*`) & container rename | Zero-downtime container recreate with network/volume preservation; auto-rollback on unhealthy exit |
| **Linux SSH** | `LINUX_SSH` | Ed25519 Key / Sudoers | `/etc` snapshot archive in `/var/backups/fleetupdate/` | Non-interactive package upgrade (APT, DNF, Pacman, APK, Zypper); `/etc` archive restore |
| **Home Assistant** | `HOME_ASSISTANT` | Long-Lived Access Token | Supervisor Backup (`backup/create` or `backup: true`) | POST `/api/services/update/install` with automatic backup flag |
| **OPNsense** | `OPNSENSE` | API Key & Secret | Automatic local XML config backup | Core REST firmware upgrade polling with automatic reboot recovery |

---

## 4. Resilient 5-Phase Execution Pipeline

Every orchestrated update follows a strict, deterministic state machine:

```mermaid
flowchart TD
    Start([Trigger Update]) --> Phase1[1. Pre-Flight Check]
    Phase1 -->|Passed| Phase2[2. Snapshot / Safety Backup]
    Phase1 -->|Failed| Halt[Alert & Halt Pipeline]

    Phase2 -->|Success| Phase3[3. Apply Package / Image / Firmware Update]
    Phase2 -->|Failed| Halt

    Phase3 -->|Success| Phase4[4. Post-Deployment Health Check 60s]
    Phase3 -->|Error| Rollback[5. Automatic Immediate Rollback]

    Phase4 -->|Probe Success| Success[Validate State & Refresh HA]
    Phase4 -->|Probe Failure| Rollback

    Success --> Notify[Dispatch Success Notification]
    Rollback --> NotifyRollback[Dispatch Critical Alert with Rollback Details]
    Halt --> NotifyHalt[Dispatch Pre-Flight Failure Alert]
```

### Execution Steps Breakdown:
1. **Pre-Flight Check:** Validates host reachability, credentials, disk headroom, and lock exclusivity.
2. **Snapshot / Safety Backup:** Creates a point-in-time rollback artifact adapted to the target platform (ZFS snapshot, vzdump archive, XML configuration, or Docker tagged image layer). **The update never proceeds if this step fails.**
3. **Apply Update:** Dispatches package, firmware, or container updates with live output streaming over WebSockets.
4. **Post-Deployment Health Check:** Executes active probes (HTTP/HTTPS, TCP socket, ICMP) over a configurable observation window (default: 60s).
5. **Rollback or Finalize:** If probes fail, the orchestrator triggers an immediate automated rollback to the pre-update state and dispatches priority notifications.

### Concurrency & Race-Condition Protection:
`UpdatesService.triggerUpdate` uses a pessimistic transactional lock (`SELECT ... FOR UPDATE` via Prisma raw query) to ensure that concurrent update requests on the same host are rejected immediately with `TASK_ALREADY_RUNNING`.

---

## 5. Security & Zero-Trust Core

1. **AES-256-GCM Vault at Rest:**
   - All credentials (SSH private keys, API tokens, passwords) are encrypted in PostgreSQL using **AES-256-GCM** with unique 96-bit random IVs and 128-bit authentication tags.
   - Master key is injected strictly via environment variables or Docker Secrets (`/run/secrets/master_key`).
2. **Immediate Session Invalidation (`tokenVersion`):**
   - User sessions use `HttpOnly` and `SameSite=Strict` cookies. Changing a password or 2FA configuration increments the user's `tokenVersion`, instantly invalidating active sessions across all devices.
3. **Timing Attack Protection:**
   - All cryptographic comparisons (webhook secret tokens, signatures, authentication hashes) use `crypto.timingSafeEqual`.
4. **Network Segmentation:**
   - `internal-net`: Isolated internal bridge network for PostgreSQL database and backend without external port exposure.
   - `mgmt-net`: Dedicated outbound bridge network for reaching target managed infrastructure.
5. **Immutable Audit Trails:**
   - Every administrative action, credential rotation, and update task execution is immutably recorded in the `audit_logs` table.
