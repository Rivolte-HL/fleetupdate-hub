# FleetUpdate-Hub Engineering & Security Rules

Ces règles s'appliquent à l'ensemble du projet FleetUpdate-Hub (backend, frontend, adaptateurs et scripts).

## 1. Sécurité & Cryptographie (Priorité Absolue)
- **Zéro fuite de secret** : Ne jamais logger de clés privées, tokens API, hashs de mot de passe ou clés maîtresses. Toujours passer par `audit_logs` avec des valeurs masquées (`***`).
- **Cryptographie AES-256-GCM** :
  - Tout chiffrement doit générer un IV aléatoire de 12 octets (96 bits) via `crypto.randomBytes(12)`.
  - Toujours extraire et valider l'Authentication Tag de 16 octets (128 bits) via `cipher.getAuthTag()`.
  - Comparaison sécurisée : utiliser `crypto.timingSafeEqual` pour la validation des signatures et tokens sensibles.
  - La clé maîtresse doit provenir strictement des variables d'environnement (`MASTER_KEY`) ou d'un secret Docker monté (`/run/secrets/master_key`).
- **Moindre privilège** :
  - Chaque adaptateur d'infrastructure doit opérer avec des comptes de service dédiés (ex. rôle PVE `fleetupdate@pve`, sudoers restreints sur Linux, API Key à portée limitée sur OPNsense).

## 2. Architecture & Pattern Adaptateur
- **Contrat `BaseServiceAdapter`** :
  - Chaque plateforme cible doit étendre `BaseServiceAdapter` sans déroger à la signature des méthodes : `checkVersion`, `fetchChangelog`, `createBackup`, `applyUpdate`, `healthCheck`, `rollback`.
  - Pas d'adhérence directe aux détails d'implémentation : l'orchestrateur communique uniquement via l'interface abstraite.
  - Si une capacité n'est pas supportée par une cible, lever une exception explicite ou retourner un résultat structuré indiquant l'absence de support sans faire crasher le service.

## 3. Fiabilité du Pipeline 5 Phases
- **Atomicité & Déterminisme** :
  1. *Pre-Flight* : Valider la connectivité, l'espace disque résiduel et l'absence de verrou concurrent.
  2. *Safety Backup* : La mise à jour ne DOIT JAMAIS commencer si la sauvegarde/snapshot échoue.
  3. *Apply Update* : Diffuser les logs pas-à-pas en streaming via WebSocket vers le client web.
  4. *Health Check* : Observer la cible pendant une fenêtre configurable (défaut : 60s) via sondes actives (HTTP, TCP, ICMP).
  5. *Rollback* : En cas d'échec de la sonde ou de l'application, déclencher le retour arrière immédiat sans intervention humaine et notifier immédiatement l'administrateur.

## 4. Rigueur TypeScript & Code
- **Typage Strict** : Interdiction formelle d'utiliser `any`. Définir des types et interfaces explicites pour chaque payload et réponse d'adaptateur.
- **Validation Zod** : Valider toutes les entrées utilisateurs et payloads d'API entrants avec des schémas Zod stricts (`z.object({...}).strict()`).
- **Tests Systématiques** : Toute modification d'adaptateur ou du moteur de pipeline doit être accompagnée ou vérifiée par un test unitaire avec mocks (SSH2, Docker API, Prisma, Axios).
