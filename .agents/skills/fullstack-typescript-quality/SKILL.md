---
name: fullstack-typescript-quality
description: Use this skill when writing, reviewing, or refactoring TypeScript, Express, Prisma, or React/Vite code in FleetUpdate-Hub to maintain high architectural standards, strict typing, and clean design.
---

# FleetUpdate Fullstack TypeScript & Architecture Quality

Ce skill garantit l'excellence architecturale et la cohérence de code entre le backend Node.js/Express et le frontend React 18/Vite.

## Critères d'Activation
- Développement ou refactorisation de composants UI React (`frontend/src/`).
- Ajout de nouveaux endpoints d'API Express ou requêtes Prisma ORM.
- Nettoyage de la dette technique, renforcement du typage et gestion des erreurs.

---

## 1. Standards TypeScript & Backend Express

1. **Typage Strict (Zéro `any`)** :
   - Remplacer tout usage de `any` par des types spécifiques ou des génériques typés (`unknown` si nécessaire avec validation de type).
2. **Gestion Asynchrone & Error Boundary** :
   - Tout contrôleur Express asynchrone doit encapsuler son code dans `try / catch` ou un middleware `asyncHandler` pour éviter les promesses rejetées non interceptées.
3. **Schémas Zod Bipolaires** :
   - Valider le corps des requêtes HTTP avec Zod et exporter le type inféré pour le réutiliser côté client :
     ```typescript
     export const CreateHostSchema = z.object({
       name: z.string().min(2),
       type: z.nativeEnum(HostType),
       ipAddress: z.string().ip()
     }).strict();

     export type CreateHostInput = z.infer<typeof CreateHostSchema>;
     ```
4. **Transactions Prisma** :
   - Lorsque deux tables ou plus doivent être synchronisées (ex. création d'un hôte + initialisation des identifiants dans le coffre), toujours utiliser `prisma.$transaction()`.

---

## 2. Standards Frontend (React 18, Vite & Tailwind)

1. **Architecture des Composants** :
   - Séparer les composants d'affichage purs (*presentational*) de la logique de fetch / WebSocket (hooks personnalisés).
   - Utiliser `ToastContext` pour notifier l'utilisateur plutôt que des alertes natives du navigateur.
2. **Temps Réel & WebSockets** :
   - Toujours gérer la déconnexion et la reconnexion automatique du WebSocket `/ws/pipeline`.
   - Nettoyer les écouteurs d'événements dans le retour de `useEffect` :
     ```typescript
     useEffect(() => {
       const ws = new WebSocket(url);
       ws.onmessage = handleMessage;
       return () => ws.close();
     }, [url]);
     ```
3. **Internationalisation (i18n)** :
   - Chaque libellé UI doit être défini dans `frontend/src/i18n/locales/fr.ts` et `en.ts`.
   - Ne jamais coder en dur de texte en français ou anglais dans les composants.

---

## 3. Commandes de Validation
```powershell
# Vérification du typage backend
cd backend
npm run typecheck

# Vérification du typage frontend
cd ../frontend
npm run build
```
