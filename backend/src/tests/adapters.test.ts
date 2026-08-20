import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { ProxmoxAdapter } from '../adapters/proxmox/proxmox.adapter.js';
import { OPNsenseAdapter } from '../adapters/opnsense/opnsense.adapter.js';
import { LinuxSshAdapter } from '../adapters/linux-ssh/linux-ssh.adapter.js';
import { HomeAssistantAdapter } from '../adapters/home-assistant/home-assistant.adapter.js';
import { ProxmoxBackupServerAdapter } from '../adapters/pbs/pbs.adapter.js';

test('Infrastructure Adapters Metadata & Interfaces', async (t) => {
  await t.test('ProxmoxAdapter metadata should declare proper capabilities', () => {
    const adapter = new ProxmoxAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.PROXMOX);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('createBackup'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
  });

  await t.test('OPNsenseAdapter metadata should declare proper capabilities', () => {
    const adapter = new OPNsenseAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.OPNSENSE);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
  });

  await t.test('LinuxSshAdapter metadata should declare proper capabilities', () => {
    const adapter = new LinuxSshAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.LINUX_SSH);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
  });

  await t.test('HomeAssistantAdapter metadata should declare proper capabilities', () => {
    const adapter = new HomeAssistantAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.HOME_ASSISTANT);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
  });

  await t.test('ProxmoxBackupServerAdapter metadata should declare proper capabilities', () => {
    const adapter = new ProxmoxBackupServerAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.PROXMOX_BACKUP_SERVER);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
  });
});
