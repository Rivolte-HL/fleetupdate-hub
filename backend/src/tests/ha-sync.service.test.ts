import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { HomeAssistantSyncService } from '../services/ha-sync.service.js';

test('HomeAssistantSyncService - Native UpdateEntity & Zero-Trust WebSocket Tests', async (t) => {
  const syncService = HomeAssistantSyncService.getInstance();

  await t.test('slugify should properly sanitize host names into compliant HA slugs', () => {
    assert.equal(syncService.slugify('Proxmox Node 01'), 'proxmox_node_01');
    assert.equal(syncService.slugify('Serveur Elephant / Baie 2'), 'serveur_elephant_baie_2');
    assert.equal(syncService.slugify('TrueNAS-SCALE.local (Main)'), 'truenas_scale_local_main');
    assert.equal(syncService.slugify('__docker-host_99__'), 'docker_host_99');
    assert.equal(syncService.slugify(''), 'unnamed');
  });

  await t.test('syncHostState should publish ONLY native update entity with supported_features: 13 and remove legacy input_boolean', async () => {
    const publishedStates: Array<{ entityId: string; state: string; attributes: any }> = [];
    const removedEntities: string[] = [];

    const mockClient: any = {
      setEntityState: async (entityId: string, state: string, attributes: any) => {
        publishedStates.push({ entityId, state, attributes });
        return { entity_id: entityId, state };
      },
      removeEntityState: async (entityId: string) => {
        removedEntities.push(entityId);
        return { message: 'Entity removed.' };
      }
    };

    syncService.setMockConnection({
      client: mockClient,
      config: { enabled: true, syncEntitiesEnabled: true, allowHaTrigger: true }
    });

    const mockHost: any = {
      id: 'host-uuid-1234',
      name: 'Proxmox PVE 01',
      adapterType: HostType.PROXMOX,
      currentVersion: '8.2-2',
      targetVersion: '8.2-4',
      availableUpdatesCount: 3,
      isOnline: true,
      lastCheckAt: new Date()
    };

    await syncService.syncHostState(mockHost);

    // 1. ONLY 1 entity published (no extra input_boolean created!)
    assert.equal(publishedStates.length, 1);

    const updateEntity = publishedStates[0];
    assert.equal(updateEntity.entityId, 'update.fleetupdate_proxmox_pve_01');
    assert.equal(updateEntity.state, 'on'); // hasUpdate = true
    assert.equal(updateEntity.attributes.friendly_name, 'Proxmox PVE 01');
    assert.equal(updateEntity.attributes.installed_version, '8.2-2');
    assert.equal(updateEntity.attributes.latest_version, '8.2-4');

    // 2. SUPPORT_INSTALL (1) + SUPPORT_PROGRESS (4) + SUPPORT_BACKUP (8) = 13
    assert.equal(updateEntity.attributes.supported_features, 13);
    assert.ok(updateEntity.attributes.entity_picture.includes('proxmox'));
    assert.equal(updateEntity.attributes.icon, 'mdi:server');

    // 3. Proactively removed legacy input_boolean helper from Home Assistant
    assert.ok(removedEntities.includes('input_boolean.fleetupdate_update_proxmox_pve_01'));

    syncService.setMockConnection(null);
  });

  await t.test('pollOnce cleans up any existing legacy input_boolean entities in HA', async () => {
    const removedEntities: string[] = [];

    const mockClient: any = {
      getStates: async () => [
        { entity_id: 'update.fleetupdate_pve_01', state: 'on' },
        { entity_id: 'input_boolean.fleetupdate_update_pve_01', state: 'off' },
        { entity_id: 'input_boolean.fleetupdate_update_truenas', state: 'off' },
        { entity_id: 'light.salon', state: 'on' }
      ],
      removeEntityState: async (entityId: string) => {
        removedEntities.push(entityId);
        return { message: 'Entity removed.' };
      }
    };

    syncService.setMockConnection({
      client: mockClient,
      config: { enabled: true, syncEntitiesEnabled: true }
    });

    await syncService.pollOnce();

    assert.equal(removedEntities.length, 2);
    assert.ok(removedEntities.includes('input_boolean.fleetupdate_update_pve_01'));
    assert.ok(removedEntities.includes('input_boolean.fleetupdate_update_truenas'));

    syncService.setMockConnection(null);
  });

  await t.test('Air-Gap Watcher Lifecycle', () => {
    syncService.startWatcher(60000);
    syncService.stopWatcher();
  });
});
