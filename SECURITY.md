# Politique de Sécurité (Security Policy)

La sécurité et la confidentialité sont au cœur de la conception de **FleetUpdate-Hub**. Ce document décrit notre engagement envers les principes Zero-Trust et la procédure de signalement responsable des vulnérabilités.

---

## 🛡️ Versions Supportées

Seule la dernière version majeure / mineure bénéficie des correctifs de sécurité prioritaires :

| Version | Statut du support |
| :--- | :--- |
| `1.0.x` (main) | :white_check_mark: Actif (Correctifs de sécurité immédiats) |
| `< 1.0.0` | :x: Non supporté |

---

## 🚨 Signalement d'une Vulnérabilité (Responsible Disclosure)

Si vous découvrez une faille de sécurité ou une vulnérabilité dans FleetUpdate-Hub :

1. **Ne créez PAS d'Issue publique sur GitHub.**
2. Utilisez la fonctionnalité de **Signalement de Sécurité Privé (GitHub Security Advisories)** accessible dans l'onglet **Security > Advisories > Report a vulnerability** du dépôt GitHub.
3. Alternativement, contactez directement l'équipe de sécurité du projet par canal sécurisé ou PGP.

### Informations utiles à inclure dans votre rapport :
* Type de vulnérabilité (ex: Injection, Bypass d'authentification, Faille CSRF, Élévation de privilèges).
* Composant affecté (ex: `backend/src/core/encryption.service.ts`, `auth.controller.ts`, etc.).
* Étapes précises pour reproduire le problème (PoC / Proof of Concept).
* Impact potentiel et évaluation CVSS estimée.

### Engagements & Délais de Réponse :
* **Accusé de réception initial :** Sous 48 heures ouvrées.
* **Évaluation et confirmation du statut :** Sous 5 jours ouvrés.
* **Publication d'un correctif (Patch) & CVE / Advisory :** Dans un délai de 14 à 30 jours selon la criticité.

---

## 🔒 Principes de Sécurité Intégrés (Zero-Trust)

FleetUpdate-Hub intègre par défaut plusieurs niveaux de sécurité renforcés :
* **Chiffrement au repos AES-256-GCM :** Toutes les clés privées, jetons API et identifiants stockés dans la base de données sont chiffrés avec un vecteur d'initialisation (IV) de 96 bits unique par enregistrement et un tag d'authentification de 128 bits.
* **Gestion stricte de la Clé Maîtresse :** La clé `MASTER_ENCRYPTION_KEY` ne doit jamais être commitée et doit être injectée exclusivement par Docker Secrets ou variable d'environnement sécurisée.
* **Principe du Moindre Privilège :** Les comptes de service sur les cibles (Proxmox, OPNsense, hôtes Linux) doivent être cantonnés aux permissions strictement nécessaires.
* **Cookies HttpOnly & Protection CSRF :** Les jetons JWT de session sont transmis exclusivement via des cookies `HttpOnly`, `SameSite=Strict`, avec protection `CSRF-Token`.
* **Authentification Forte (MFA / 2FA) :** Support natif du protocole TOTP (Google Authenticator, FreeOTP, Aegis, Bitwarden).
