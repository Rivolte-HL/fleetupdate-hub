---
name: fleetupdate-adapter-builder
description: Use this skill when creating, extending, refactoring, or auditing infrastructure adapters (Proxmox, TrueNAS, OPNsense, Docker, Linux SSH, Home Assistant, or new targets like Kubernetes, pfSense, Unraid, Synology) in FleetUpdate-Hub.
---

# FleetUpdate Adapter Builder

Ce skill formalise le développement d'adaptateurs d'infrastructure conformes au pattern hexagonal de FleetUpdate-Hub.

## Critères d'Activation
- Création d'un nouvel adaptateur dans `backend/src/adapters/<target>/`.
- Ajout ou modification des méthodes de sauvegarde atomique (`createBackup`), de mise à jour (`applyUpdate`), de sonde de santé (`healthCheck`) ou de restauration (`rollback`).
- Enregistrement dans `backend/src/core/service.registry.ts`.

---

## 1. Contrat Fondamental (`BaseServiceAdapter`)

Tout adaptateur doit hériter de `BaseServiceAdapter` (`backend/src/core/base.adapter.ts`) et implémenter les méthodes suivantes :

```typescript
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { 
  AdapterMetadata, VersionInfo, ChangelogItem, 
  BackupResult, UpdateExecutionResult, HealthCheckResult, 
  RollbackResult, TargetCredentials 
} from '../../types/adapter.types.js';
import { Host } from '@prisma/client';

export class MyNewTargetAdapter extends BaseServiceAdapter {
  // 1. Déclaration des métadonnées, formulaire d'ajout et champs secrets
  abstract getMetadata(): AdapterMetadata;

  // 2. Détection de version et vérification des mises à jour disponibles
  abstract checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo>;

  // 3. Récupération des notes de version / changelogs
  abstract fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]>;

  // 4. Création d'un point de restauration avant mise à jour
  abstract createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult>;

  // 5. Déclenchement de la mise à jour avec streaming des logs
  abstract applyUpdate(host: Host, credentials: TargetCredentials, onProgress?: (step: string, log: string) => void): Promise<UpdateExecutionResult>;

  // 6. Sonde de vérification active post-déploiement
  abstract healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult>;

  // 7. Restauration immédiate vers l'état pré-mise à jour
  abstract rollback(host: Host, credentials: TargetCredentials, backupIdentifier: string, onProgress?: (step: string, log: string) => void): Promise<RollbackResult>;
}
```

---

## 2. Règles de Conception des Adaptateurs

1. **Sauvegarde Atomique (`createBackup`)** :
   - Doit retourner un `backupId` persistant utilisable par `rollback()`.
   - Si la cible ne supporte pas nativement les snapshots (ex: conteneur Docker), concevoir un mécanisme de rétention d'image (tag `backup-<timestamp>`).
2. **Streaming de Progression (`onProgress`)** :
   - Toujours invoquer `onProgress(stepName, logChunk)` pendant les phases longues pour alimenter les WebSockets du dashboard en temps réel.
3. **Health Check Proactif (`healthCheck`)** :
   - Tester au minimum la réactivité du port/service applicatif et la cohérence de l'état (ex. API REST répond 200 OK, conteneur en statut `running`, démon SSH fonctionnel).
4. **Gestion des Erreurs Non-Bloquantes** :
   - Si `fetchChangelog` échoue (ex. coupure réseau vers le registre upstream), retourner un tableau vide sans faire échouer l'ensemble du pipeline.
5. **Nettoyage des Connexions** :
   - Toujours fermer les sockets, clients SSH2 (`client.end()`) et flux HTTP dans un bloc `finally`.

---

## 3. Enregistrement dans le ServiceRegistry

Ajoutez le nouvel adaptateur dans `backend/src/core/service.registry.ts` :
```typescript
import { MyNewTargetAdapter } from '../adapters/my-target/my-target.adapter.js';

this.registerAdapter(new MyNewTargetAdapter());
```

---

## 4. Tests Obligatoires
Chaque nouvel adaptateur doit comporter sa suite de tests unitaires mockée :
```powershell
npm test -- -t "MyNewTargetAdapter"
```
