# Guide de Contribution (Contributing to FleetUpdate-Hub)

Merci de vous intéresser à l'amélioration de **FleetUpdate-Hub** ! Ce document définit les normes et bonnes pratiques pour contribuer au projet.

---

## 🧭 Principes Directeurs

1. **Sécurité Zero-Trust en priorité :** Toute nouvelle intégration ou modification doit respecter le principe du moindre privilège, le chiffrement systématique des secrets et la validation stricte des entrées utilisateur.
2. **Qualité et Couverture de Tests :** Chaque nouvel adaptateur ou service doit inclure des tests unitaires et de non-régression.
3. **Modularité via l'Architecture Adapter :** Ne jamais modifier l'orchestrateur central (`pipeline.engine.ts`) pour gérer des spécificités d'un service. Étendez plutôt `BaseServiceAdapter`.

---

## 🛠️ Environnement de Développement Local

### Prérequis
* Node.js 20+ (ou version LTS active)
* npm 10+
* Docker & Docker Compose
* PostgreSQL 16 (ou via le conteneur `docker-compose.dev.yml`)

### Installation & Démarrage

1. **Cloner le dépôt et initialiser les dépendances :**
   ```bash
   git clone https://github.com/Rivolte-HL/fleetupdate-hub.git
   cd fleetupdate-hub
   ```

2. **Démarrer la base de données PostgreSQL de développement :**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. **Configurer et lancer le Backend :**
   ```bash
   cd backend
   cp ../.env.example .env
   npm install
   npx prisma generate
   npx prisma migrate dev
   npm run dev
   ```

4. **Configurer et lancer le Frontend :**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

---

## 🌿 Stratégie de Branches & Conventions de Commit

### Branches Git
* `main` : Branche de production protégée.
* `feat/<nom-de-la-feature>` : Nouvelles fonctionnalités ou nouveaux adaptateurs de service.
* `fix/<nom-du-bug>` : Correctifs de bugs.
* `docs/<sujet>` : Améliorations de la documentation.
* `refactor/<module>` : Nettoyage et restructuration du code sans changement fonctionnel.

### Conventional Commits
Nous suivons la spécification standard [Conventional Commits](https://www.conventionalcommits.org/) :

* `feat(adapter): add support for TrueNAS SCALE API`
* `fix(proxmox): resolve snapshot timeout on busy QEMU guests`
* `security(vault): enforce strict IV regeneration on rotation`
* `docs(readme): add troubleshooting guide for OPNsense TLS`
* `test(backend): add unit tests for Docker rollback sequence`

---

## 🧪 Validation & Tests avant Soumission de PR

Avant d'ouvrir une Pull Request, assurez-vous que toutes les vérifications passent localement :

```bash
# 1. Vérification des types Backend & Frontend
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit

# 2. Exécution des tests unitaires
cd ../backend && npm test

# 3. Compilation du Frontend
cd ../frontend && npm run build
```

---

## 📦 Ajouter un Nouvel Adaptateur de Service

Pour créer un adaptateur de mise à jour pour un nouvel équipement :
1. Créez un dossier dans `backend/src/adapters/<service-name>/`.
2. Étendez `BaseServiceAdapter` et implémentez l'ensemble des méthodes requises :
   - `checkVersion(host)`
   - `fetchChangelog(host, targetVersion)`
   - `createBackup(host)`
   - `applyUpdate(host, payload)`
   - `healthCheck(host)`
   - `rollback(host, backupIdentifier)`
3. Déclarez les métadonnées dans `getMetadata()`.
4. Enregistrez la nouvelle classe dans `backend/src/core/service.registry.ts`.
5. Ajoutez les tests unitaires correspondants dans `backend/src/tests/`.
