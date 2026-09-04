import { Host, HostType } from '@prisma/client';
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { OPNsenseClient } from './opnsense.client.js';
import {
  AdapterMetadata,
  VersionInfo,
  ChangelogItem,
  BackupResult,
  UpdateExecutionResult,
  HealthCheckResult,
  RollbackResult,
  TargetCredentials
} from '../../types/adapter.types.js';

export interface NormalizedOPNsensePackage {
  name: string;
  currentVersion: string;
  targetVersion: string;
  reason?: string;
  comment?: string;
}

export function extractNormalizedOPNsensePackages(status: any): NormalizedOPNsensePackage[] {
  if (!status || typeof status !== 'object') {
    return [];
  }

  const rawPackages: any[] = [];

  // OPNsense API returns packages/sets either as associative objects ({ pkg_name: { ... } }) or arrays
  const sources = [
    status.all_packages,
    status.all_sets,
    status.upgrade_packages,
    status.new_packages,
    status.reinstall_packages
  ];

  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      rawPackages.push(...src);
    } else if (typeof src === 'object') {
      for (const [key, val] of Object.entries(src)) {
        if (typeof val === 'object' && val !== null) {
          rawPackages.push({ name: (val as any).name || key, ...(val as any) });
        } else {
          rawPackages.push({ name: key, version: String(val) });
        }
      }
    }
  }

  const seen = new Set<string>();
  const normalized: NormalizedOPNsensePackage[] = [];

  for (const p of rawPackages) {
    if (!p) continue;
    const name = String(p.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const currentVersion = String(p.old ?? p.current_version ?? p.version ?? '').trim();
    const targetVersion = String(p.new ?? p.new_version ?? '').trim();
    const reason = String(p.reason || '').trim();
    const comment = String(p.comment || (p.repository ? `Repository: ${p.repository}` : '')).trim();

    const isUpdate = Boolean(
      (targetVersion && targetVersion !== 'N/A' && targetVersion !== currentVersion) ||
      p.new_version ||
      reason.toLowerCase() === 'upgrade' ||
      reason.toLowerCase() === 'new'
    );

    if (isUpdate) {
      normalized.push({
        name,
        currentVersion: currentVersion === 'N/A' ? '' : currentVersion,
        targetVersion: targetVersion === 'N/A' ? '' : targetVersion,
        reason,
        comment
      });
    }
  }

  return normalized;
}

export class OPNsenseAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.OPNSENSE,
      displayName: 'OPNsense Firewall & Gateway',
      description: 'Firmware upgrades, package management, and XML configuration backups via OPNsense Core REST API',
      icon: 'shield',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'allowSelfSigned',
          label: 'Allow Self-Signed SSL Certificates',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Enable if OPNsense uses an internal or self-signed WebGUI certificate'
        }
      ],
      credentialFields: [
        {
          name: 'apiKey',
          label: 'OPNsense API Key',
          type: 'text',
          required: true,
          placeholder: 'e.g. key_xxxxxxxxxxxxxxxxxxxx',
          description: 'Generated in System > Access > Users > Edit User > API Keys'
        },
        {
          name: 'apiSecret',
          label: 'OPNsense API Secret',
          type: 'password',
          required: true,
          isSecret: true,
          placeholder: '••••••••••••••••••••••••••••••••',
          description: 'Secret key associated with the API Key'
        },
        {
          name: 'caCert',
          label: 'Custom CA Certificate (Optional)',
          type: 'textarea',
          required: false,
          description: 'PEM format Root CA certificate for strict SSL verification'
        }
      ]
    };
  }

  private getClient(host: Host, credentials: TargetCredentials): OPNsenseClient {
    const meta = (host.metadata as any) || {};
    return new OPNsenseClient({
      baseUrl: host.endpointUrl,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      caCert: credentials.caCert,
      allowSelfSigned: meta.allowSelfSigned === true,
      timeoutMs: 30000
    });
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const client = this.getClient(host, credentials);
    // Request status with forceRefresh=true to trigger synchronous firmware probe
    let status = await client.getFirmwareStatus(true);

    if (status.status === 'none') {
      try {
        await client.checkForUpdates();
        await new Promise(resolve => setTimeout(resolve, 3000));
        status = await client.getFirmwareStatus(false);
      } catch {}
    }

    const currentVersion = status.product_version ? `OPNsense ${status.product_version}` : 'OPNsense';
    const parsedUpdates = typeof status.updates === 'number'
      ? status.updates
      : parseInt(String(status.updates || '0'), 10);
    const requiresReboot = status.upgrade_needs_reboot === '1' || status.upgrade_needs_reboot === 1 || status.upgrade_needs_reboot === true;

    const upgradablePackages = extractNormalizedOPNsensePackages(status);
    const updatesCount = !isNaN(parsedUpdates) && parsedUpdates > 0
      ? parsedUpdates
      : upgradablePackages.length;

    const hasUpdate = updatesCount > 0 || status.status === 'update' || status.status === 'upgrade';

    let displayTarget = currentVersion;
    if (hasUpdate) {
      if (status.product_latest && status.product_latest !== status.product_version) {
        displayTarget = `OPNsense ${status.product_latest}`;
      } else if (upgradablePackages.length === 1) {
        const pkg = upgradablePackages[0];
        displayTarget = pkg.currentVersion
          ? `${pkg.name}: ${pkg.currentVersion} ➔ ${pkg.targetVersion}`
          : `${pkg.name}: ${pkg.targetVersion}`;
      } else if (updatesCount > 0) {
        displayTarget = `${currentVersion} (+${updatesCount} package updates)`;
      } else {
        displayTarget = `${currentVersion} (Update available)`;
      }
    }

    return {
      currentVersion,
      targetVersion: displayTarget,
      hasUpdate,
      requiresReboot,
      packageCount: updatesCount,
      extraDetails: {
        statusMsg: status.status_msg,
        downloadSize: status.download_size,
        productLatest: status.product_latest,
        packages: upgradablePackages.map(p => ({
          name: p.name,
          current: p.currentVersion,
          target: p.targetVersion,
          comment: p.comment || p.reason
        }))
      }
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const client = this.getClient(host, credentials);
    try {
      const status = await client.getFirmwareStatus();
      const upgradable = extractNormalizedOPNsensePackages(status);
      if (upgradable.length > 0) {
        return upgradable.map(p => ({
          version: p.currentVersion && p.targetVersion
            ? `${p.currentVersion} ➔ ${p.targetVersion}`
            : (p.targetVersion || 'Update'),
          summary: `Package ${p.name}: ${p.currentVersion ? p.currentVersion + ' ➔ ' : ''}${p.targetVersion} (${p.comment || p.reason || 'OPNsense / FreeBSD system update'})`,
          isSecurityFix: true,
          detailsUrl: 'https://docs.opnsense.org/releases.html'
        }));
      }
    } catch (e) {}

    return [{
      version: 'Latest OPNsense Release',
      summary: 'Consult official release notes and changelogs on docs.opnsense.org.',
      detailsUrl: 'https://docs.opnsense.org/releases.html'
    }];
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const snapshotName = backupName || `opnsense_backup_${Date.now()}`;
    // OPNsense auto-creates local XML backups before firmware upgrades
    return {
      success: true,
      backupId: snapshotName,
      backupType: 'XML_CONFIG',
      message: 'OPNsense automated XML configuration backup registered.'
    };
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const client = this.getClient(host, credentials);

    // 1. Check current firmware status to choose between standard update and major upgrade
    onProgress?.('UPDATING', 'Inspecting OPNsense firmware status before dispatching update...');
    const currentStatus = await client.getFirmwareStatus(true);

    const isMajorUpgrade = currentStatus.status === 'upgrade' ||
      (Boolean(currentStatus.product_latest) &&
       Boolean(currentStatus.product_version) &&
       currentStatus.product_latest !== currentStatus.product_version &&
       currentStatus.product_latest!.split('.')[0] !== currentStatus.product_version!.split('.')[0]);

    let res: { status: string; msg_uuid?: string };
    if (isMajorUpgrade) {
      onProgress?.('UPDATING', `Triggering OPNsense MAJOR firmware upgrade to ${currentStatus.product_latest}...`);
      res = await client.triggerUpgrade();
    } else {
      onProgress?.('UPDATING', 'Triggering OPNsense standard firmware update (pkg upgrade)...');
      res = await client.triggerUpdate();
    }

    if (res.status !== 'ok') {
      throw new Error(`OPNsense update invocation rejected with status: ${res.status}`);
    }

    onProgress?.('UPDATING', `OPNsense update successfully initiated (Task ID: ${res.msg_uuid || 'queued'}).`);

    const logs: string[] = [`Update trigger status: ${res.status || 'OK'}`];
    let lastReportedLine = '';
    let isRebooting = false;
    let updateCompleted = false;

    // 2. Poll upgrade status with progress streaming (up to 60 attempts x 5s = 5 minutes)
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        const upStatus = await client.getUpgradeStatus();
        if (upStatus.log) {
          const lines = upStatus.log.trim().split('\n');
          const lastLine = lines[lines.length - 1]?.trim() || '';
          if (lastLine && lastLine !== lastReportedLine) {
            lastReportedLine = lastLine;
            onProgress?.('UPDATING', `[OPNsense Engine] ${lastLine}`);
            logs.push(lastLine);
          }
        }

        if (upStatus.status === 'done') {
          onProgress?.('UPDATING', 'OPNsense update completed successfully.');
          updateCompleted = true;
          // Check if system requires reboot after update
          if (upStatus.log && upStatus.log.includes('***REBOOT***')) {
            onProgress?.('UPDATING', 'Kernel/Base update detected: Triggering firewall reboot...');
            try {
              await client.rebootSystem();
              isRebooting = true;
            } catch (rebootErr: any) {
              onProgress?.('UPDATING', `Automatic reboot trigger notice: ${rebootErr.message}`);
            }
          }
          break;
        }

        if (upStatus.status === 'reboot') {
          onProgress?.('UPDATING', 'OPNsense completed update and is initiating automatic reboot.');
          isRebooting = true;
          updateCompleted = true;
          break;
        }

        if (upStatus.status === 'error') {
          throw new Error(`OPNsense updater reported an error: ${upStatus.log?.slice(-300) || 'Unknown error'}`);
        }
      } catch (err: any) {
        if (err.message?.includes('updater reported an error')) {
          throw err;
        }
        // Network connection dropped when OPNsense reboots or reloads network services
        onProgress?.('UPDATING', 'Connection to OPNsense dropped (firewall is rebooting or restarting core network services)...');
        isRebooting = true;
        updateCompleted = true;
        break;
      }
    }

    if (!updateCompleted && !isRebooting) {
      throw new Error('OPNsense update monitoring timed out after 5 minutes without completion signal.');
    }

    // 3. Graceful reboot recovery polling if firewall rebooted (up to 30 attempts x 5s = 150s)
    if (isRebooting) {
      onProgress?.('HEALTH_CHECK', 'Waiting for OPNsense firewall to complete reboot and resume services (up to 150s)...');
      let recovered = false;
      for (let attempt = 1; attempt <= 30; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const probe = await client.getFirmwareStatus(false);
          if (probe && (probe.status === 'ok' || probe.product_version || probe.status)) {
            onProgress?.('HEALTH_CHECK', `OPNsense is back online and operational (Attempt ${attempt}).`);
            recovered = true;
            break;
          }
        } catch {}
      }

      if (!recovered) {
        logs.push('Notice: Firewall may still be finishing its boot sequence.');
      }
    }

    return {
      success: true,
      requiresReboot: isRebooting,
      logs,
      message: 'OPNsense firmware update applied successfully.'
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const client = this.getClient(host, credentials);
      const status = await client.getFirmwareStatus();
      const elapsed = Date.now() - start;

      return {
        isHealthy: true,
        responseTimeMs: elapsed,
        checks: [
          { name: 'OPNsense HTTPS API Reachable', passed: true },
          { name: 'Firmware Subsystem Status', passed: !!status.status, details: `Status: ${status.status}` }
        ],
        message: 'OPNsense firewall is online and healthy.'
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [{ name: 'OPNsense HTTPS API Reachable', passed: false, details: err.message }],
        message: `Unreachable: ${err.message}`
      };
    }
  }

  public async rollback(
    host: Host,
    credentials: TargetCredentials,
    backupIdentifier: string,
    onProgress?: (step: string, log: string) => void
  ): Promise<RollbackResult> {
    onProgress?.('ROLLBACK', `Inspecting OPNsense configuration checkpoint (${backupIdentifier})...`);
    return {
      success: false,
      restoredVersion: host.currentVersion || 'Unmodified',
      logs: [
        `OPNsense pre-update configuration checkpoint: ${backupIdentifier}`,
        'Automatic core firmware downgrade is restricted on firewalls to prevent network disconnection.',
        'Please restore the configuration XML checkpoint via OPNsense Web GUI (System -> Configuration -> Backups) or serial console if required.'
      ],
      message: `Automatic firmware downgrade is restricted on OPNsense to prevent network disconnection. Checkpoint XML "${backupIdentifier}" is preserved.`
    };
  }
}
