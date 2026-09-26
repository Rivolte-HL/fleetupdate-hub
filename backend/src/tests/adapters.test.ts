import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { ProxmoxAdapter } from '../adapters/proxmox/proxmox.adapter.js';
import { OPNsenseAdapter, extractNormalizedOPNsensePackages } from '../adapters/opnsense/opnsense.adapter.js';
import { LinuxSshAdapter } from '../adapters/linux-ssh/linux-ssh.adapter.js';
import { HomeAssistantAdapter } from '../adapters/home-assistant/home-assistant.adapter.js';
import { ProxmoxBackupServerAdapter } from '../adapters/pbs/pbs.adapter.js';
import { TrueNASAdapter } from '../adapters/truenas/truenas.adapter.js';

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

  await t.test('OPNsenseAdapter extractNormalizedOPNsensePackages handles object dictionary responses without error', () => {
    const statusWithObject = {
      status: 'update',
      updates: 2,
      product_version: '24.1.1',
      product_latest: '24.1.2',
      all_packages: {
        curl: {
          name: 'curl',
          reason: 'upgrade',
          old: '8.5.0',
          new: '8.6.0',
          repository: 'OPNsense'
        },
        openssl: {
          name: 'openssl',
          reason: 'upgrade',
          old: '3.0.12',
          new: '3.0.13',
          repository: 'OPNsense'
        }
      }
    };

    const pkgs = extractNormalizedOPNsensePackages(statusWithObject);
    assert.equal(pkgs.length, 2);
    assert.equal(pkgs[0].name, 'curl');
    assert.equal(pkgs[0].currentVersion, '8.5.0');
    assert.equal(pkgs[0].targetVersion, '8.6.0');
    assert.equal(pkgs[1].name, 'openssl');
  });

  await t.test('OPNsenseAdapter extractNormalizedOPNsensePackages handles array, empty object, and null safely', () => {
    assert.deepEqual(extractNormalizedOPNsensePackages(null), []);
    assert.deepEqual(extractNormalizedOPNsensePackages({}), []);
    assert.deepEqual(extractNormalizedOPNsensePackages({ all_packages: [] }), []);
    assert.deepEqual(extractNormalizedOPNsensePackages({ all_packages: {} }), []);

    const arrayStatus = {
      all_packages: [
        { name: 'sudo', version: '1.9.15', new_version: '1.9.16' }
      ]
    };
    const pkgs = extractNormalizedOPNsensePackages(arrayStatus);
    assert.equal(pkgs.length, 1);
    assert.equal(pkgs[0].name, 'sudo');
    assert.equal(pkgs[0].currentVersion, '1.9.15');
    assert.equal(pkgs[0].targetVersion, '1.9.16');
  });

  await t.test('OPNsenseAdapter checkVersion handles dictionary responses without throwing', async () => {
    const adapter = new OPNsenseAdapter();
    const mockHost: any = {
      id: 'host-opn-1',
      name: 'OPNsense Firewall',
      endpointUrl: 'https://192.168.1.1',
      adapterType: HostType.OPNSENSE,
      metadata: {}
    };
    const mockCreds: any = {
      apiKey: 'key',
      apiSecret: 'secret'
    };

    (adapter as any).getClient = () => ({
      getFirmwareStatus: async () => ({
        status: 'update',
        product_version: '24.1.1',
        product_latest: '24.1.2',
        updates: 1,
        all_packages: {
          curl: {
            name: 'curl',
            reason: 'upgrade',
            old: '8.5.0',
            new: '8.6.0'
          }
        }
      }),
      checkForUpdates: async () => {}
    });

    const verInfo = await adapter.checkVersion(mockHost, mockCreds);
    assert.equal(verInfo.hasUpdate, true);
    assert.equal(verInfo.currentVersion, 'OPNsense 24.1.1');
    assert.equal(verInfo.packageCount, 1);
    assert.equal(verInfo.extraDetails?.packages?.length, 1);
    assert.equal(verInfo.extraDetails?.packages?.[0].name, 'curl');
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

  await t.test('TrueNASAdapter metadata should declare proper capabilities', () => {
    const adapter = new TrueNASAdapter();
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.TRUENAS);
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('fetchChangelog'));
    assert.ok(meta.supportedActions.includes('createBackup'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
    assert.ok(meta.supportedActions.includes('healthCheck'));
    assert.ok(meta.supportedActions.includes('rollback'));
    assert.ok(meta.credentialFields.some(f => f.name === 'apiKey'));
  });

  await t.test('TrueNASAdapter checkVersion computes system update and apps correctly', async () => {
    const adapter = new TrueNASAdapter();
    const mockHost: any = {
      id: 'host-truenas-1',
      name: 'truenas-storage',
      endpointUrl: 'https://192.168.1.150',
      adapterType: HostType.TRUENAS,
      currentVersion: 'TrueNAS-SCALE-24.10.0',
      metadata: { targetScope: 'ALL' }
    };
    const mockCreds: any = { apiKey: 'test-key' };

    (adapter as any).getClient = () => ({
      getSystemInfo: async () => ({
        version: 'TrueNAS-SCALE-24.10.0',
        hostname: 'truenas-storage',
        uptime_seconds: 86400
      }),
      checkSystemUpdate: async () => ({
        status: 'AVAILABLE',
        version: 'TrueNAS-SCALE-24.10.1',
        changelog: 'TrueNAS SCALE 24.10.1 maintenance release'
      }),
      getApps: async () => [
        {
          id: 'nextcloud',
          name: 'nextcloud',
          status: 'RUNNING',
          currentVersion: '29.0.4',
          targetVersion: '29.0.5',
          hasUpdate: true,
          type: 'DOCKER_APP'
        },
        {
          id: 'plex',
          name: 'plex',
          status: 'RUNNING',
          currentVersion: '1.32.0',
          targetVersion: '1.32.0',
          hasUpdate: false,
          type: 'DOCKER_APP'
        }
      ],
      getAlerts: async () => []
    });

    const verInfo = await adapter.checkVersion(mockHost, mockCreds);
    assert.equal(verInfo.hasUpdate, true);
    assert.equal(verInfo.requiresReboot, true);
    // 1 app with update + 1 OS update = 2
    assert.equal(verInfo.packageCount, 2);
    assert.equal(verInfo.extraDetails?.apps?.length, 2);
    assert.equal(verInfo.extraDetails?.appsWithUpdateCount, 1);
    assert.ok(verInfo.targetVersion.includes('24.10.1'));
    assert.ok(verInfo.targetVersion.includes('1 app(s) to upgrade'));
  });

  await t.test('TrueNASAdapter createBackup creates ZFS snapshot successfully', async () => {
    const adapter = new TrueNASAdapter();
    const mockHost: any = {
      id: 'host-truenas-1',
      name: 'truenas-storage',
      endpointUrl: 'https://192.168.1.150',
      adapterType: HostType.TRUENAS,
      metadata: { snapshotDataset: 'boot-pool' }
    };
    const mockCreds: any = { apiKey: 'test-key' };

    let createdDataset = '';
    let createdSnapshot = '';

    (adapter as any).getClient = () => ({
      createZfsSnapshot: async (dataset: string, snapName: string) => {
        createdDataset = dataset;
        createdSnapshot = snapName;
        return { success: true };
      }
    });

    const backupRes = await adapter.createBackup(mockHost, mockCreds, 'test-snap-1');
    assert.equal(backupRes.success, true);
    assert.equal(backupRes.backupType, 'ZFS_SNAPSHOT');
    assert.equal(backupRes.backupId, 'boot-pool@test-snap-1');
    assert.equal(createdDataset, 'boot-pool');
    assert.equal(createdSnapshot, 'test-snap-1');
  });

  await t.test('TrueNASAdapter applyUpdate monitors job and verifies application status', async () => {
    const adapter = new TrueNASAdapter();
    const mockHost: any = {
      id: 'host-truenas-1',
      name: 'truenas-storage',
      endpointUrl: 'https://192.168.1.150',
      adapterType: HostType.TRUENAS,
      metadata: { targetScope: 'APPS_ONLY' }
    };
    const mockCreds: any = { apiKey: 'test-key' };

    let jobTracked = false;
    let waitForJobCalledWith: number | null = null;
    const progressLogs: string[] = [];

    (adapter as any).getClient = () => ({
      getApps: async () => [
        {
          id: 'nextcloud',
          name: 'nextcloud',
          status: 'RUNNING',
          currentVersion: '29.0.4',
          targetVersion: '29.0.5',
          hasUpdate: true,
          type: 'DOCKER_APP'
        }
      ],
      upgradeApp: async () => {
        return { job_id: 888 };
      },
      waitForJob: async (jobId: number, options?: any) => {
        jobTracked = true;
        waitForJobCalledWith = jobId;
        options?.onProgress?.({ percent: 50, description: 'Extracting layer...' });
        return { id: jobId, state: 'SUCCESS' };
      }
    });

    const result = await adapter.applyUpdate(mockHost, mockCreds, (_step, msg) => {
      progressLogs.push(msg);
    });

    assert.equal(result.success, true);
    assert.equal(jobTracked, true);
    assert.equal(waitForJobCalledWith, 888);
    assert.ok(progressLogs.some(l => l.includes('888')));
    assert.ok(progressLogs.some(l => l.includes('50% - Extracting layer...')));
  });
});
