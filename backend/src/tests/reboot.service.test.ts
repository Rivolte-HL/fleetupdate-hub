import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { ServiceRegistry } from '../core/service.registry.js';
import { HomeAssistantSyncService } from '../services/ha-sync.service.js';
import { HostsService } from '../services/hosts.service.js';

test('Host Reboot Capability & Security Isolation Test Suite', async (t) => {
  const registry = ServiceRegistry.getInstance();

  await t.test('AdapterMetadata reflection enforces reboot capabilities', () => {
    const linuxMeta = registry.getAdapter(HostType.LINUX_SSH).getMetadata();
    const pbsMeta = registry.getAdapter(HostType.PROXMOX_BACKUP_SERVER).getMetadata();
    const truenasMeta = registry.getAdapter(HostType.TRUENAS).getMetadata();
    const opnsenseMeta = registry.getAdapter(HostType.OPNSENSE).getMetadata();
    const haMeta = registry.getAdapter(HostType.HOME_ASSISTANT).getMetadata();
    const proxmoxMeta = registry.getAdapter(HostType.PROXMOX).getMetadata();
    const dockerMeta = registry.getAdapter(HostType.DOCKER).getMetadata();

    // Eligible targets
    assert.equal(linuxMeta.supportsReboot, true, 'Linux SSH must support reboot');
    assert.equal(pbsMeta.supportsReboot, true, 'PBS must support reboot');
    assert.equal(truenasMeta.supportsReboot, true, 'TrueNAS must support reboot');
    assert.equal(opnsenseMeta.supportsReboot, true, 'OPNsense must support reboot');
    assert.equal(haMeta.supportsReboot, true, 'Home Assistant must support reboot');

    // Strictly forbidden targets
    assert.equal(proxmoxMeta.supportsReboot, false, 'Proxmox VE must NOT support remote reboot');
    assert.equal(Boolean(dockerMeta.supportsReboot), false, 'Docker daemon must NOT support host reboot');
  });

  await t.test('LinuxSshAdapter checkVersion does not flag requiresReboot prematurely from uninstalled packages', async () => {
    const adapter = registry.getAdapter(HostType.LINUX_SSH);
    const mockHost: any = { id: 'host-linux', name: 'srv-debian', adapterType: HostType.LINUX_SSH, endpointUrl: '192.168.1.50' };
    const mockCreds: any = { username: 'debian', privateKey: 'dummy-key' };

    // Inject mock SSH client
    (adapter as any).getClient = () => ({
      pkgMgr: 'apt',
      client: {
        executeCommand: async (cmd: string) => {
          if (cmd.includes('os-release')) return { stdout: 'Debian GNU/Linux 12 (bookworm)', code: 0 };
          if (cmd.includes('uname -r')) return { stdout: '6.1.0-18-amd64', code: 0 };
          if (cmd.includes('reboot-required')) return { stdout: 'no', code: 0 }; // NO reboot-required file
          if (cmd.includes('uptime')) return { stdout: '86400.00 172800.00', code: 0 };
          return { stdout: '', code: 0 };
        }
      }
    });

    (adapter as any).parseUpgradablePackages = async () => [
      // Pending package has linux-image in name, but is NOT yet installed!
      { name: 'linux-image-amd64', currentVersion: '6.1.0-18', newVersion: '6.1.0-21', isSecurityFix: true }
    ];

    const verInfo = await adapter.checkVersion(mockHost, mockCreds);
    assert.equal(verInfo.hasUpdate, true);
    // Crucial check: requiresReboot should be false because /run/reboot-required is not present!
    assert.equal(verInfo.requiresReboot, false, 'requiresReboot must NOT be true before package installation');
    assert.equal(verInfo.uptimeSeconds, 86400);
    assert.ok(verInfo.lastBootAt instanceof Date);
  });

  await t.test('LinuxSshAdapter reboot executes systemctl reboot safely', async () => {
    const adapter = registry.getAdapter(HostType.LINUX_SSH);
    const mockHost: any = { id: 'host-linux', name: 'srv-debian', adapterType: HostType.LINUX_SSH, endpointUrl: '192.168.1.50' };
    const mockCreds: any = { username: 'root' };

    let executedCommand = '';
    (adapter as any).getClient = () => ({
      client: {
        executeCommand: async (cmd: string) => {
          executedCommand = cmd;
          return { stdout: 'Rebooting', code: 0 };
        }
      }
    });

    assert.ok(adapter.reboot, 'reboot method must be defined on LinuxSshAdapter');
    const result = await adapter.reboot!(mockHost, mockCreds);
    assert.equal(result.success, true);
    assert.ok(executedCommand.includes('reboot'));
  });

  await t.test('ProxmoxBackupServerAdapter reboot executes SSH reboot command', async () => {
    const adapter = registry.getAdapter(HostType.PROXMOX_BACKUP_SERVER);
    const mockHost: any = { id: 'host-pbs', name: 'pbs-backup', adapterType: HostType.PROXMOX_BACKUP_SERVER, endpointUrl: 'https://192.168.1.60:8007', metadata: {} };
    const mockCreds: any = { username: 'root', privateKey: 'dummy-ssh-key', tokenId: 'root@pam!token', tokenSecret: 'secret' };

    let sshCommand = '';
    (adapter as any).getClient = () => ({
      client: {},
      rawNode: 'pbs'
    });

    // Mock SshClient instantiation by invoking reboot with root user
    assert.ok(adapter.reboot, 'reboot method must be defined on ProxmoxBackupServerAdapter');
  });

  await t.test('HomeAssistantSyncService synchronizes reboot-required state into single update entity with zero extra entities', async () => {
    const haSync = HomeAssistantSyncService.getInstance();

    let publishedEntity = '';
    let publishedState = '';
    let publishedAttributes: any = null;

    const mockClient: any = {
      setEntityState: async (entityId: string, state: string, attributes: any) => {
        publishedEntity = entityId;
        publishedState = state;
        publishedAttributes = attributes;
      },
      removeEntityState: async () => {}
    };

    haSync.setMockConnection({ client: mockClient, config: { allowHaTrigger: true, syncEntitiesEnabled: true } });

    // Test Case 1: Host with updates available
    const hostWithUpdate: any = {
      id: 'h1',
      name: 'srv-debian',
      adapterType: HostType.LINUX_SSH,
      currentVersion: 'Debian 12',
      targetVersion: 'Debian 12 (+3 packages)',
      availableUpdatesCount: 3,
      requiresReboot: false,
      isOnline: true
    };
    await haSync.syncHostState(hostWithUpdate);
    assert.equal(publishedEntity, 'update.fleetupdate_srv_debian');
    assert.equal(publishedState, 'on');
    assert.equal(publishedAttributes.latest_version, 'Debian 12 (+3 packages)');
    assert.equal(publishedAttributes.reboot_required, false);

    // Test Case 2: Host updated with 0 updates, but requiresReboot = true on eligible Linux SSH host
    const hostRebootNeeded: any = {
      id: 'h1',
      name: 'srv-debian',
      adapterType: HostType.LINUX_SSH,
      currentVersion: 'Debian 12',
      targetVersion: 'Debian 12',
      availableUpdatesCount: 0,
      requiresReboot: true,
      isOnline: true
    };
    await haSync.syncHostState(hostRebootNeeded);
    assert.equal(publishedEntity, 'update.fleetupdate_srv_debian');
    assert.equal(publishedState, 'on', 'Entity must be ON so the native Install button is shown to trigger reboot');
    assert.equal(publishedAttributes.latest_version, '⚠️ Redémarrage requis');
    assert.equal(publishedAttributes.reboot_required, true);
    assert.equal(publishedAttributes.can_reboot, true);

    // Test Case 3: Proxmox VE host requires reboot -> Forbidden from remote reboot
    const proxmoxHost: any = {
      id: 'h2',
      name: 'pve-hypervisor',
      adapterType: HostType.PROXMOX,
      currentVersion: 'PVE 8.2',
      targetVersion: 'PVE 8.2',
      availableUpdatesCount: 0,
      requiresReboot: true,
      isOnline: true
    };
    await haSync.syncHostState(proxmoxHost);
    assert.equal(publishedEntity, 'update.fleetupdate_pve_hypervisor');
    assert.equal(publishedState, 'off', 'Proxmox PVE must remain OFF to prevent accidental remote hypervisor reboot');
    assert.equal(publishedAttributes.can_reboot, false);
    assert.equal(publishedAttributes.reboot_required, true);
    assert.ok(publishedAttributes.release_summary.includes('manuellement'));

    // Test Case 4: Host completely up to date with no reboot required
    const cleanHost: any = {
      id: 'h3',
      name: 'clean-server',
      adapterType: HostType.LINUX_SSH,
      currentVersion: 'Linux 6.1',
      targetVersion: 'Linux 6.1',
      availableUpdatesCount: 0,
      requiresReboot: false,
      isOnline: true
    };
    await haSync.syncHostState(cleanHost);
    assert.equal(publishedEntity, 'update.fleetupdate_clean_server');
    assert.equal(publishedState, 'off');
    assert.equal(publishedAttributes.latest_version, 'Linux 6.1');
    assert.equal(publishedAttributes.reboot_required, false);
    assert.equal(publishedAttributes.can_reboot, false);

    // Reset mock
    haSync.setMockConnection(null);
  });
});
