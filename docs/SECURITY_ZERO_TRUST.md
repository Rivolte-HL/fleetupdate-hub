# Architecture de Sécurité Zero-Trust (FleetUpdate-Hub)

Ce document décrit le modèle de menaces, les mécanismes cryptographiques et les directives de sécurité réseau appliqués à **FleetUpdate-Hub**.

---

## 1. Modèle de Menaces & Principes Directeurs

Un système centralisé d'orchestration de mises à jour représente une cible stratégique : une compromission totale de l'orchestrateur pourrait permettre à un attaquant de propager du code malveillant sur toute l'infrastructure gérée.

Pour éliminer ce risque, **FleetUpdate-Hub** applique trois règles fondamentales :
1. **Règle d'Or Anti-Circularité :** FleetUpdate-Hub ne doit **jamais** gérer sa propre mise à jour ou celle de son propre hôte physique.
2. **Cloisonnement des Réseaux :** La base de données PostgreSQL réside dans un sous-réseau Docker non routable (`internal-net`).
3. **Zéro Confiance au Repos (Zero-Trust Storage) :** Aucune clé privée, token ou mot de passe n'est stocké en clair dans la base de données ou dans les logs.

---

## 2. Coffre de Chiffrement des Secrets (AES-256-GCM)

Toutes les données d'authentification relatives aux hôtes cibles (clés privées SSH, tokens API, secrets d'API) sont chiffrées au repos via le standard militaire **AES-256-GCM** (Galois/Counter Mode) :

* **Clé Maîtresse :** 256 bits (32 octets / 64 caractères hexadécimaux), injectée via la variable d'environnement `MASTER_ENCRYPTION_KEY` ou un fichier de secret Docker `/run/secrets/master_key`.
* **Vecteur d'Initialisation (IV) :** 96 bits (12 octets) généré aléatoirement à chaque chiffrement, garantissant que deux chiffrements de la même donnée produisent deux textes chiffrés totalement distincts.
* **Tag d'Authentification :** 128 bits (16 octets) garantissant l'intégrité et l'authenticité des données chiffrées. Toute tentative d'altération en base de données entraîne un échec immédiat du déchiffrement.

Format du stockage en base de données :
```
<IV_HEX>:<AUTH_TAG_HEX>:<CIPHERTEXT_HEX>
```

---

## 3. Principe du Moindre Privilège sur les Cibles

Les comptes créés sur les machines cibles ne doivent **jamais** disposer des droits `root` ou `admin` globaux.

### Configuration recommandée par type de cible :

#### 1. Proxmox VE
* **Utilisateur :** `fleetupdate@pve`
* **Jeton API :** `fleetupdate@pve!update-agent`
* **Rôles limités :** `Sys.Audit`, `VM.Audit`, `VM.Backup`, `VM.Snapshot`, `VM.Snapshot.Rollback` (aucun accès aux consoles ou aux configurations réseau).

#### 2. OPNsense
* **Utilisateur API :** `fleetupdate-api`
* **Privilèges limités :** Uniquement les permissions sur le contrôleur de firmware : `core/firmware/*`.

#### 3. Hôtes Linux (Agentless SSH)
* **Utilisateur système :** `fleetupdate`
* **Authentification :** Clé SSH `Ed25519` sans mot de passe.
* **Sudoers restreint :**
  ```sudoers
  fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get, /usr/bin/needrestart, /usr/bin/dnf, /usr/bin/pacman
  ```

---

## 4. Authentification de l'IHM et Sessions

* **Jetons JWT :** Transmis exclusivement via des cookies `HttpOnly`, `SameSite=Strict`, `Secure` (en production).
* **Double Facteur (2FA / TOTP) :** Basé sur l'algorithme RFC 6238 (secret 20 octets encodé en Base32).
* **Protection CSRF :** Double soumission de token pour chaque requête modifiant l'état (`POST`, `PUT`, `DELETE`).
* **Protection Anti-Brute-Force :** Limitation de débit dynamique (`express-rate-limit`) sur les routes d'authentification (`/api/auth/login` : 5 requêtes par minute).
