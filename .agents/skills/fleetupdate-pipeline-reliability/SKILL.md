---
name: fleetupdate-pipeline-reliability
description: Use this skill when troubleshooting, refactoring, or testing the 5-phase update pipeline (Pre-flight, Snapshot, Apply Update, Health Check, Rollback) or WebSocket log streaming in FleetUpdate-Hub.
---

# FleetUpdate Pipeline Reliability & Rollback Orchestrator

Ce skill guide l'analyse et la fiabilisation de la machine à états finis du moteur de mise à jour (`backend/src/core/pipeline.engine.ts`).

## Critères d'Activation
- Modification de la boucle d'exécution du pipeline de mise à jour.
- Ajustement des sondes de santé (*healthchecks*) ou des règles de déclenchement du rollback automatique.
- Résolution de blocages, verrous orphelins ou coupures de flux WebSocket (`/ws/pipeline`).

---

## 1. Les 5 Phases Déterministes du Pipeline

Le pipeline doit respecter scrupuleusement la séquence d'états :

```text
[PENDING]
   │
   ▼
[PRE_FLIGHT] ──(Échec)──► [HALTED]
   │
   ▼
[BACKUP]     ──(Échec)──► [HALTED] (Aucune modif sur l'hôte !)
   │
   ▼
[UPDATING]   ──(Échec)──► [ROLLING_BACK] ──► [ROLLED_BACK]
   │
   ▼
[HEALTHCHECK]──(Échec)──► [ROLLING_BACK] ──► [ROLLED_BACK]
   │
   ▼
[SUCCESS]
```

### Règles d'Or par Phase :
1. **PRE_FLIGHT** :
   - Vérifier la connectivité réseau avec la cible.
   - Vérifier qu'aucune autre tâche n'est active sur cet hôte (`exclusivity lock`).
   - S'assurer que le compte de service a les droits requis.
2. **BACKUP** :
   - Invoquer `adapter.createBackup()`.
   - **Règle absolue** : Si le snapshot échoue, le pipeline S'ARRÊTE IMMÉDIATEMENT. La phase `UPDATING` ne doit sous aucun prétexte débuter.
3. **UPDATING** :
   - Émettre chaque ligne de journalisation via `onProgress(step, logEntry)` pour transmission temps réel aux clients connectés.
4. **HEALTHCHECK** :
   - Exécuter la sonde active pendant une durée configurable (ex. 60 secondes avec intervalles réguliers).
   - En cas d'inaccessibilité de la cible à l'issue du délai, lever une alerte et basculer en rollback.
5. **ROLLBACK** :
   - Invoquer `adapter.rollback(host, creds, backupId)`.
   - Mettre à jour le statut final en base (`ROLLED_BACK`).
   - Déclencher immédiatement une notification prioritaire (Discord/Telegram/Home Assistant).

---

## 2. Prévention des Verrous Orphelins & Concurrence
- Si le processus backend redémarre pendant qu'une tâche est `UPDATING` ou `BACKUP`, le `scheduler.service.ts` doit détecter les tâches périmées (*stale tasks*) et les marquer en échec ou tenter un diagnostic.
- Toujours utiliser des transactions Prisma lorsqu'on met à jour le statut d'une tâche et l'historique d'un hôte.

---

## 3. Tests de Validation
Pour tester la robustesse de la machine à états :
```powershell
cd backend
npm test -- -t "pipeline.test"
```
