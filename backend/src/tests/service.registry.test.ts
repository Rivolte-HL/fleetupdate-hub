import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { ServiceRegistry } from '../core/service.registry.js';
import { ProxmoxAdapter } from '../adapters/proxmox/proxmox.adapter.js';
import { ProxmoxBackupServerAdapter } from '../adapters/pbs/pbs.adapter.js';
import { OPNsenseAdapter } from '../adapters/opnsense/opnsense.adapter.js';
import { DockerAdapter } from '../adapters/docker/docker.adapter.js';
import { LinuxSshAdapter } from '../adapters/linux-ssh/linux-ssh.adapter.js';
import { HomeAssistantAdapter } from '../adapters/home-assistant/home-assistant.adapter.js';

test('ServiceRegistry Dynamic Module Registry Tests', async (t) => {
  const registry = ServiceRegistry.getInstance();

  registry.registerAdapter(new ProxmoxAdapter());
  registry.registerAdapter(new ProxmoxBackupServerAdapter());
  registry.registerAdapter(new OPNsenseAdapter());
  registry.registerAdapter(new DockerAdapter());
  registry.registerAdapter(new LinuxSshAdapter());
  registry.registerAdapter(new HomeAssistantAdapter());

  await t.test('should retrieve Proxmox adapter correctly', () => {
    const adapter = registry.getAdapter(HostType.PROXMOX);
    assert.ok(adapter);
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.PROXMOX);
    assert.ok(meta.connectionFields.length > 0);
  });

  await t.test('should retrieve Proxmox Backup Server adapter correctly', () => {
    const adapter = registry.getAdapter(HostType.PROXMOX_BACKUP_SERVER);
    assert.ok(adapter);
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.PROXMOX_BACKUP_SERVER);
    assert.ok(meta.credentialFields.some(f => f.name === 'tokenId'));
  });

  await t.test('should retrieve OPNsense adapter correctly', () => {
    const adapter = registry.getAdapter(HostType.OPNSENSE);
    assert.ok(adapter);
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.OPNSENSE);
    assert.ok(meta.credentialFields.some(f => f.name === 'apiKey'));
  });

  await t.test('should list all registered adapter metadata', () => {
    const allMeta = registry.getAllMetadata();
    assert.ok(allMeta.length >= 6);
    const types = allMeta.map(m => m.type);
    assert.ok(types.includes(HostType.PROXMOX));
    assert.ok(types.includes(HostType.PROXMOX_BACKUP_SERVER));
    assert.ok(types.includes(HostType.OPNSENSE));
    assert.ok(types.includes(HostType.DOCKER));
    assert.ok(types.includes(HostType.LINUX_SSH));
    assert.ok(types.includes(HostType.HOME_ASSISTANT));
  });

  await t.test('should throw error for unregistered adapter type', () => {
    assert.throws(() => {
      registry.getAdapter('UNKNOWN_MODULE');
    });
  });
});
