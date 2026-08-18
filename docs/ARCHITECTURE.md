# Architecture Technique et Spécifications (FleetUpdate-Hub)

Ce document présente l'état de l'art, les choix d'architecture logicielle et les spécifications techniques de la plateforme **FleetUpdate-Hub**.

---

## 1. Contexte & Problématique

La gestion et la maintenance des infrastructures informatiques privées et hybrides souffrent d'une forte fragmentation :
* Les gestionnaires de paquets OS (APT, DNF, Pacman, APK) fonctionnent de manière hétérogène.
* Les conteneurs d'applications (Docker, Podman) nécessitent un cycle d'analyse des registres d'images et de rollback en cas de crash.
* Les hyperviseurs de virtualisation (Proxmox VE, PBS) requièrent des instantanés (snapshots) préalables et des sauvegardes cohérentes (`vzdump`).
* Les équipements réseau périmétriques (OPNsense) reposent sur des API REST spécifiques et imposent des vérifications de redémarrage.
* La domotique (Home Assistant) impose la coordination des mises à jour Core/OS avec les sauvegardes Supervisor.

**FleetUpdate-Hub** résout cette fragmentation en fournissant une plateforme unique, sécurisée (Zero-Trust), modulaire (Pattern Adapter) et résiliente (Rollback automatique).

---

## 2. Architecture Globale du Système

Le système s'articule autour de deux couches principales :

```
┌────────────────────────────────────────────────────────────────────────┐
│                          POSTE D'ADMINISTRATION                        │
│             (Navigateur Web HTTPS / TLS 1.3 / MFA TOTP)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   REVERSE PROXY (Nginx / Traefik)                      │
│             (Filtrage IP, En-têtes sécurisées HSTS / CSP)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│     FRONTEND (React 18 / Vite)    │ │   BACKEND (Node.js / Express)     │
│   • Dashboard sombre en temps réel│ │   • Pipeline Engine (Orchestrateur│
│   • Formulaires dynamiques        │ │   • Service Registry (Plugins)    │
│   • WebSocket Client (État tâches)│ │   • Encryption Vault (AES-256-GCM)│
└───────────────────────────────────┘ └─────────────────┬─────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │    POSTGRESQL 16 (Base Données)   │
                                      │   • Secrets chiffrés au repos     │
                                      │   • Journaux d'audit immuables    │
                                      └───────────────────────────────────┘
```

---

## 3. Pattern Adapter & Extensibilité

Tous les services cibles implémentent une classe abstraite unifiée `BaseServiceAdapter` gérée par un registre dynamique `ServiceRegistry` :

```typescript
export abstract class BaseServiceAdapter {
  abstract getMetadata(): AdapterMetadata;
  abstract checkVersion(host: HostWithSecrets): Promise<VersionCheckResult>;
  abstract fetchChangelog(host: HostWithSecrets, targetVersion?: string): Promise<ChangelogResult>;
  abstract createBackup(host: HostWithSecrets): Promise<BackupResult>;
  abstract applyUpdate(host: HostWithSecrets, payload?: any): Promise<UpdateExecutionResult>;
  abstract healthCheck(host: HostWithSecrets): Promise<HealthCheckResult>;
  abstract rollback(host: HostWithSecrets, backupIdentifier: string): Promise<RollbackResult>;
}
```

### Modules d'Intégration Supportés :

| Adaptateur | Authentification | Prise de Snapshot / Sauvegarde | Déploiement / Action |
| :--- | :--- | :--- | :--- |
| **Proxmox VE** | `PVEAPIToken` (Jeton API) | Instantané QEMU/LXC via POST `/snapshot` ou sauvegarde `vzdump` | Mise à jour paquets & OS du nœud |
| **Proxmox Backup Server** | `PBSAPIToken` | Vérification d'intégrité des datastores | Mise à jour paquets du serveur PBS |
| **OPNsense** | Clé/Secret API (HTTP Basic) | Sauvegarde automatique configuration XML locale | POST `/api/core/firmware/upgrade` |
| **Docker Engine** | Socket TLS mTLS / SSH | Conservation de l'image précédente pour rollback | Pull d'image + Recreation du conteneur |
| **Linux SSH** | Clé Ed25519 / Sudoers restreint | Instantané LVM / Btrfs / ZFS | Exécution APT, DNF ou Pacman |
| **Home Assistant** | Long-Lived Access Token | Sauvegarde Supervisor (`backup: true`) | POST `/api/services/update/install` |

---

## 4. Pipeline d'Exécution Résilient en 5 Étapes

Chaque action de mise à jour orchestrée suit une séquence déterministe garantie :

```
[1. Pre-Flight Check] ──────────► [2. Backup / Snapshot] ──────────► [3. Apply Update]
        │ (Échec)                         │ (Échec)                          │ (Échec)
        ▼                                 ▼                                  ▼
 [Arrêt & Alerte]                  [Arrêt & Alerte]                [5. Rollback Immédiat]
                                                                             │
                                                                             ▼
                                                                  [4. Health Check (60s)]
                                                                             │
                                              ┌──────────────────────────────┴──────────────────────────────┐
                                              ▼                                                             ▼
                                     (Succès du test)                                              (Échec du test)
                                    [Validation & Purge]                                        [5. Rollback Automatique]
                                              │                                                             │
                                              └──────────────────────┬──────────────────────────────────────┘
                                                                     ▼
                                                       [Notification Webhook Sortante]
```

1. **Pre-flight check :** Vérification de la connectivité réseau, de l'espace disque disponible et de l'absence de tâches de maintenance concurrentes.
2. **Snapshot / Sauvegarde :** Création du point de restauration adapté au système cible.
3. **Application de la mise à jour :** Téléchargement et installation des paquets / images / firmwares.
4. **Validation post-déploiement (Health Check) :** Sondes de santé (ICMP, ports TCP, requêtes HTTP/API) pendant une fenêtre paramétrable (ex: 60s).
5. **Rollback ou Validation :** Si le test échoue ou si l'hôte ne répond plus, déclenchement immédiat de la procédure de retour arrière et envoi d'une alerte prioritaire (Discord / Telegram).
