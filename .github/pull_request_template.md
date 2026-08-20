## 📋 Description of Changes

<!-- Briefly describe the nature of your changes and the problem being solved. -->

### Type of Change
- [ ] 🐛 Bug fix (`fix`)
- [ ] ✨ New feature (`feat`)
- [ ] 🔒 Security hardening (`security`)
- [ ] 🚀 Performance optimization (`perf`)
- [ ] 📝 Documentation (`docs`)
- [ ] 🧪 Unit / Integration tests (`test`)
- [ ] 🧹 Refactoring (`refactor`)

---

## 🔒 Security & Zero-Trust Compliance

- [ ] **No plaintext secrets or private keys committed** (passwords, API tokens, SSH private keys).
- [ ] New credentials strictly transit through `EncryptionService` (AES-256-GCM vault).
- [ ] Principle of least privilege is enforced for all new components or service accounts.
- [ ] Input validation schemas (Zod) are added for all new API endpoints.

---

## 🧪 Validation Checklist

- [ ] Backend unit tests pass cleanly (`npm test` in `backend`).
- [ ] TypeScript typecheck passes with 0 errors (`npx tsc --noEmit` in `backend` and `frontend`).
- [ ] Frontend production build succeeds (`npm run build` in `frontend`).
- [ ] Technical documentation or README updated if applicable.
