---
name: github-readiness-sanitizer
description: Use this skill to audit, detect, and sanitize secrets, personal identifiable information (PII), proprietary credentials, and Git history before publishing a repository to GitHub or public version control.
---

# GitHub Readiness & Secret Sanitizer

Ce skill formalise les procédures d'audit pré-publication pour garantir qu'aucun secret, information personnelle identifiante (PII) ou élément sensible ne soit poussé sur un dépôt public ou partagé (GitHub, GitLab, etc.).

## 1. Périmètre d'Audit

Avant toute publication sur GitHub, exécuter un scan systématique sur les éléments suivants :

### A. Fichiers d'environnement & Secrets
- Vérifier que `.env`, `.env.local`, `.env.production`, etc., sont bien ignorés dans `.gitignore`.
- Vérifier que `.env.example` ne contient que des valeurs fictives ou d'exemple (ex: `super-secret-placeholder-key`).
- S'assurer qu'aucun fichier `.db`, `.sqlite`, `.pem`, `.key`, `.token` ou `secrets/*` n'est indexé par Git (`git ls-files`).

### B. Secrets & Clés Privées dans le Code
- Clés privées SSH (`-----BEGIN OPENSSH PRIVATE KEY-----`, `-----BEGIN RSA PRIVATE KEY-----`).
- Tokens d'API (tokens Proxmox PVEAPIToken=..., tokens Home Assistant `eyJ...`, tokens OPNsense, GitHub PATs).
- Secrets de chiffrement (clés AES maîtresse codées en dur, passphrases, secrets JWT hardcodés).
- Chaînes de connexion de bases de données avec identifiants réels (`postgresql://user:pass@host/db`).

### C. Informations Personnelles Identifiantes (PII)
- Chemins absolus locaux contenant des noms d'utilisateurs (ex: `C:\Users\Thomas\...`).
- Adresses IP privées réelles (ex: IPs de production, réseaux locaux `192.168.x.x`, `10.x.x.x` sauf si ce sont des exemples documentaires clairement identifiés).
- Noms de domaines privés ou internes, emails personnels dans les commits ou configurations.

### D. Historique Git (Commits passés)
- Scanner l'historique complet (`git log -p`) pour vérifier qu'un secret supprimé dans un commit récent ne persiste pas dans l'historique des commits précédents.
- Si un secret a été committé dans le passé, utiliser `git filter-repo` ou `BFG Repo-Cleaner` avant tout push public.

## 2. Commandes de Diagnostic Rapide

```powershell
# 1. Vérifier tous les fichiers actuellement suivis par Git
git ls-files | Select-String -Pattern "\.env|\.pem|\.key|\.sqlite|\.db|secret"

# 2. Scanner les motifs de clés privées ou secrets dans l'arbre de travail
git grep -iE "(BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}|PVEAPIToken|bearer [A-Za-z0-9_-]{20,})"

# 3. Vérifier les occurrences d'IPs locales ou chemins utilisateur
git grep -iE "Users[\\/][A-Za-z0-9_]+"
git grep -iE "192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}"
```

## 3. Matrice de Validation Pré-Publication
1. `.gitignore` complet et étanche.
2. `git status` et `git ls-files` propres (aucun fichier binaire sensible ou d'identifiants).
3. Aucun secret dans le code ou l'historique Git.
4. Licences, README et SECURITY.md présents et sans données sensibles.
