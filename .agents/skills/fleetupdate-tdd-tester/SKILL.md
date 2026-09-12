---
name: fleetupdate-tdd-tester
description: Use this skill when writing, executing, or fixing automated tests (Node.js test runner, tsx, mocks for SSH2, Docker, Prisma, Axios) in FleetUpdate-Hub.
---

# FleetUpdate TDD & Automated Testing

Ce skill définit la méthode et les patrons de test pour FleetUpdate-Hub avec le test runner natif de Node.js (`node:test`, `node:assert/strict`) et `tsx`.

## Critères d'Activation
- Ajout de tests pour un adaptateur (`backend/src/tests/<target>.adapter.test.ts`).
- Écriture de tests de non-régression après correction d'un bug.
- Validation contractuelle des flux asynchrones et des services backend.

---

## 1. Structure d'un Test Standard (`node:test`)

Tous les tests backend utilisent `node:test` et `node:assert/strict` avec syntaxe ESM :

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceRegistry } from '../core/service.registry.js';
import { HostType } from '@prisma/client';

test('Target Adapter Contract Suite', async (t) => {
  const registry = ServiceRegistry.getInstance();

  await t.test('Adapter should be registered in ServiceRegistry', () => {
    const adapter = registry.getAdapter(HostType.DOCKER);
    assert.ok(adapter, 'Adapter should be defined');
    
    const metadata = adapter.getMetadata();
    assert.equal(metadata.type, HostType.DOCKER);
    assert.ok(metadata.supportedActions.includes('applyUpdate'));
  });

  await t.test('HealthCheck should handle connection timeout gracefully', async () => {
    // Test unitaire avec mock réseau
  });
});
```

---

## 2. Patterns de Mocking pour Infrastructure Réelle

Puisque les cibles d'infrastructure (nœuds Proxmox réels, daemons Docker distants, firewalls OPNsense) ne sont pas disponibles en local dans la CI, appliquez les mocks suivants :

### A. Mocking SSH2 (pour Proxmox, PBS et Linux Agentless)
- Créez un mock simulant un stream SSH émettant du stdout et un code de sortie `0` (succès) ou `1` (erreur) :
```typescript
class MockSshClient {
  connect(config: any) { setTimeout(() => this.emit('ready'), 10); return this; }
  exec(command: string, callback: Function) {
    const mockStream = new EventEmitter();
    callback(null, mockStream);
    setTimeout(() => {
      mockStream.emit('data', Buffer.from('Hit:1 http://deb.debian.org/debian bookworm InRelease\n'));
      mockStream.emit('close', 0);
    }, 20);
  }
  end() {}
}
```

### B. Mocking Prisma Database
- Utilisez un objet simulé ou une base SQLite/in-memory de test pour éviter d'écraser la base PostgreSQL de production.

---

## 3. Commandes d'Exécution des Tests
```powershell
cd backend
npm test
# Ou exécuter un fichier de test spécifique :
npx tsx --test src/tests/docker.adapter.test.ts
```
