---
name: fleetupdate-security-auditor
description: Use this skill when auditing or modifying cryptographic operations, AES-256-GCM vault encryption, token storage, authentication, authorization middleware, or secrets management in FleetUpdate-Hub.
---

# FleetUpdate Security & Cryptography Auditor

Ce skill fournit un protocole d'audit et de sécurisation pour le coffre-fort de secrets et les couches d'authentification de FleetUpdate-Hub.

## Critères d'Activation
- Révision ou modification de `backend/src/services/encryption.service.ts` ou `auth.service.ts`.
- Ajout ou manipulation de secrets (clés SSH, tokens d'API Proxmox/OPNsense/TrueNAS, mots de passe de cibles).
- Audit de vulnérabilités, fuites de mémoire ou durcissement Zero-Trust.

---

## 1. Protocole d'Audit AES-256-GCM

Vérifiez systématiquement les 5 règles cryptographiques obligatoires :

### A. Longueur et caractère aléatoire de l'IV
- L'algorithme `aes-256-gcm` requiert un IV de **12 octets (96 bits)**.
- **Règle absolue** : L'IV ne doit **JAMAIS** être réutilisé ou codé en dur.
```typescript
const iv = crypto.randomBytes(12); // 96-bit nonce unique
```

### B. Validation de l'Authentication Tag (AEAD)
- Le tag d'authentification doit mesurer **16 octets (128 bits)**.
- Lors du déchiffrement, `setAuthTag` doit être appelé avant `decipher.final()`. Si le tag est altéré, `final()` doit lever une erreur.
```typescript
const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
```

### C. Dérivation et protection de la Clé Maîtresse
- La clé de chiffrement doit être une clé de 32 octets (256 bits).
- Si la clé maîtresse est fournie sous forme de passphrase textuelle, elle doit être dérivée via une KDF robuste (PBKDF2 ou Scrypt avec sel et itérations suffisantes).
- Toujours effacer les buffers sensibles de la mémoire dès que possible :
```typescript
sensitiveBuffer.fill(0);
```

### D. Comparaison Timing-Safe
- Pour comparer des tokens, signatures ou hachages, utilisez impérativement `crypto.timingSafeEqual` pour empêcher les attaques par canal auxiliaire (*timing attacks*).

---

## 2. Checklist d'Audit des Endpoints & Middleware

Lors de la révision d'un contrôleur ou d'une route Express :
1. **Authentification** : Le middleware `authenticateToken` est-il présent ?
2. **RBAC** : Le rôle de l'utilisateur est-il vérifié (`requireRole(['ADMIN'])`) ?
3. **Validation d'Entrée** : Le body est-il validé avec un schéma Zod `.strict()` ?
4. **Injection de Commandes** : Les paramètres passés aux adaptateurs SSH ou commandes locales sont-ils assainis ? Ne JAMAIS concaténer de chaînes brutes dans des shells.
5. **Logs & Télémétrie** : Aucun secret, token ou mot de passe ne doit figurer dans `console.log` ou `logger.info`.

---

## 3. Commandes de Vérification
Exécutez la suite de tests de sécurité du backend :
```powershell
cd backend
npm test -- -t "encryption.service"
npm test -- -t "auth.service"
```
