## 📋 Description des Changements

<!-- Décrivez brièvement la nature des modifications apportées et le problème résolu. -->

### Type de modification
- [ ] 🐛 Correction de bug (fix)
- [ ] ✨ Nouvelle fonctionnalité (feature)
- [ ] 🔒 Renforcement de la sécurité (security)
- [ ] 🚀 Optimisation des performances (perf)
- [ ] 📝 Documentation (docs)
- [ ] 🧪 Tests unitaires / intégration (test)
- [ ] 🧹 Refactorisation (refactor)

---

## 🔒 Conformité Sécurité & Zero-Trust

- [ ] **Aucun secret ou clé privée commité en clair** (mots de passe, tokens API, clés SSH).
- [ ] Les nouveaux identifiants transitent exclusivement par le coffre `EncryptionService` (AES-256-GCM).
- [ ] Le principe du moindre privilège a été respecté pour tout nouveau composant / compte de service.
- [ ] La validation des entrées utilisateur (Zod / Schemas) a été ajoutée pour tout nouvel endpoint API.

---

## 🧪 Checklist de Validation

- [ ] Les tests unitaires passent avec succès (`npm test` dans `backend`).
- [ ] La vérification des types TypeScript passe (`npx tsc --noEmit` dans `backend` et `frontend`).
- [ ] La compilation de production du frontend réussit (`npm run build` dans `frontend`).
- [ ] La documentation technique ou le README a été mis à jour si nécessaire.
