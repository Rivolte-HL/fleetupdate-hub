import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { HomeAssistantSyncService } from '../services/ha-sync.service.js';

test('HomeAssistantSyncService - Zero-Trust & Air-Gap Security Tests', async (t) => {
  const syncService = HomeAssistantSyncService.getInstance();

  await t.test('slugify should properly sanitize host names into compliant HA slugs', () => {
    assert.equal(syncService.slugify('Proxmox Node 01'), 'proxmox_node_01');
    assert.equal(syncService.slugify('Serveur Éléphant / Baie 2'), 'serveur_elephant_baie_2');
    assert.equal(syncService.slugify('TrueNAS-SCALE.local (Main)'), 'truenas_scale_local_main');
    assert.equal(syncService.slugify('__docker-host_99__'), 'docker_host_99');
    assert.equal(syncService.slugify(''), 'unnamed');
  });

  await t.test('syncHostState should publish update entity and trigger helper to Home Assistant', async () => {
    const publishedStates: Array<{ entityId: string; state: string; attributes: any }> = [];

    const mockClient: any = {
      setEntityState: async (entityId: string, state: string, attributes: any) => {
        publishedStates.push({ entityId, state, attributes });
        return { entity_id: entityId, state };
      }
    };

    syncService.setMockConnection({
      client: mockClient,
      config: { enabled: true, syncEntitiesEnabled: true, allowHaTrigger: false }
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

    assert.equal(publishedStates.length, 2);

    // 1. Native update entity
    const updateEntity = publishedStates.find(p => p.entityId.startsWith('update.'));
    assert.ok(updateEntity);
    assert.equal(updateEntity.entityId, 'update.fleetupdate_proxmox_pve_01');
    assert.equal(updateEntity.state, 'on'); // hasUpdate = true
    assert.equal(updateEntity.attributes.friendly_name, 'Proxmox PVE 01');
    assert.equal(updateEntity.attributes.installed_version, '8.2-2');
    assert.equal(updateEntity.attributes.latest_version, '8.2-4');

    // 2. Trigger helper entity
    const triggerEntity = publishedStates.find(p => p.entityId.startsWith('input_boolean.'));
    assert.ok(triggerEntity);
    assert.equal(triggerEntity.entityId, 'input_boolean.fleetupdate_update_proxmox_pve_01');
    assert.equal(triggerEntity.state, 'off');
    assert.equal(triggerEntity.attributes.fleetupdate_host_id, 'host-uuid-1234');

    syncService.setMockConnection(null);
  });

  await t.test('Security Guard: DISARMED mode must neutralize HA button clicks and reset entity to off with ZERO action', async () => {
    let resetStateCalled = false;
    let resetStateValue = '';

    const mockClient: any = {
      getStates: async () => [
        {
          entity_id: 'input_boolean.fleetupdate_update_proxmox_pve_01',
          state: 'on', // Attacker or user turned it on in Home Assistant
          attributes: {
            fleetupdate_host_id: 'host-uuid-1234'
          }
        }
      ],
      setEntityState: async (entityId: string, state: string) => {
        if (entityId === 'input_boolean.fleetupdate_update_proxmox_pve_01' && state === 'off') {
          resetStateCalled = true;
          resetStateValue = state;
        }
      }
    };

    // allowHaTrigger = false (DISARMED - Default Security Mode)
    syncService.setMockConnection({
      client: mockClient,
      config: { enabled: true, syncEntitiesEnabled: true, allowHaTrigger: false }
    });

    await syncService.pollOnce();

    // The trigger MUST be immediately reset to 'off' in HA
    assert.equal(resetStateCalled, true);
    assert.equal(resetStateValue, 'off');

    syncService.setMockConnection(null);
  });

  await t.test('Air-Gap Watcher Lifecycle', () => {
    syncService.startWatcher(60000);
    syncService.stopWatcher();
  });
});
