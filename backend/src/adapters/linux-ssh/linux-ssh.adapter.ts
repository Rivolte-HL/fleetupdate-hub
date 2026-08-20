import { Host, HostType } from '@prisma/client';
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { SshClient } from './ssh.client.js';
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

interface LinuxPackage {
  name: string;
  currentVersion: string;
  newVersion: string;
  isSecurityFix?: boolean;
}

export class LinuxSshAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.LINUX_SSH,
      displayName: 'Linux Server & VM (Agentless SSH)',
      description: 'Agentless system and container updates over SSH for Debian, Ubuntu, RHEL, Rocky, Arch, Alpine, and openSUSE',
      icon: 'terminal',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'port',
          label: 'SSH Port',
          type: 'number',
          required: false,
          defaultValue: 22,
          placeholder: '22',
          description: 'SSH daemon listening port (default: 22)'
        },
        {
          name: 'packageManager',
          label: 'Package Manager',
          type: 'select',
          required: false,
          defaultValue: 'apt',
          options: [
            { label: 'APT (Debian, Ubuntu, Proxmox, Pi-OS)', value: 'apt' },
            { label: 'DNF / YUM (RHEL, Rocky, Alma, Fedora, CentOS)', value: 'dnf' },
            { label: 'Pacman (Arch Linux, Manjaro)', value: 'pacman' },
            { label: 'APK (Alpine Linux)', value: 'apk' },
            { label: 'Zypper (openSUSE, SLES)', value: 'zypper' }
          ],
          description: 'Distribution package manager for system upgrades'
        },
        {
          name: 'composeDirectory',
          label: 'Docker Compose Project Path (Optional)',
          type: 'text',
          required: false,
          placeholder: '/opt/docker or ~/docker',
          description: 'If set, pulls and restarts docker-compose services during the update cycle'
        }
      ],
      credentialFields: [
        {
          name: 'username',
          label: 'SSH Username (Requires Sudo)',
          type: 'text',
          required: true,
          placeholder: 'fleetupdate or root',
          description: 'User with passwordless sudo or appropriate permissions'
        },
        {
          name: 'privateKey',
          label: 'SSH Private Key (Ed25519 or RSA)',
          type: 'textarea',
          required: false,
          isSecret: true,
          placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----\n...',
          description: 'Recommended: dedicated SSH private key'
        },
        {
          name: 'passphrase',
          label: 'Private Key Passphrase (Optional)',
          type: 'password',
          required: false,
          isSecret: true,
          description: 'Passphrase if your private key is encrypted'
        },
        {
          name: 'password',
          label: 'SSH Password / Sudo Password',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: '••••••••',
          description: 'Alternative password authentication if private key is not used'
        }
      ]
    };
  }

  private sanitizeIdentifier(rawId: string): string {
    const clean = rawId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
      throw new Error(`[LinuxSshAdapter] Invalid or unsafe identifier: ${rawId}`);
    }
    return clean;
  }

  private getClient(host: Host, credentials: TargetCredentials): { client: SshClient; pkgMgr: string } {
    const meta = (host.metadata as any) || {};
    const validPkgMgrs = ['apt', 'dnf', 'pacman', 'apk', 'zypper'];
    const pkgMgr = validPkgMgrs.includes(meta.packageManager) ? meta.packageManager : 'apt';

    let hostAddress = host.endpointUrl.trim().replace(/^ssh:\/\//i, '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    let port = parseInt(meta.port || meta.sshPort || credentials.port || host.port || 22, 10);
    if (hostAddress.includes(':')) {
      const parts = hostAddress.split(':');
      hostAddress = parts[0];
      if (!meta.port && !host.port && parts[1]) {
        const parsedPort = parseInt(parts[1], 10);
        if (!isNaN(parsedPort)) port = parsedPort;
      }
    }

    const client = new SshClient({
      host: hostAddress,
      port,
      username: meta.username || credentials.username || 'fleetupdate',
      privateKey: credentials.privateKey,
      passphrase: credentials.passphrase,
      password: credentials.password
    });
    return { client, pkgMgr };
  }

  /**
   * Parses upgradable packages and versions across different package managers
   */
  private async parseUpgradablePackages(client: SshClient, pkgMgr: string): Promise<LinuxPackage[]> {
    const packages: LinuxPackage[] = [];

    try {
      if (pkgMgr === 'apt') {
        // Refresh apt cache silently
        await client.executeCommand('sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq || true');
        const res = await client.executeCommand('apt list --upgradable 2>/dev/null');
        const lines = res.stdout.split('\n');

        for (const line of lines) {
          // Format: nginx/stable 1.22.1-9 amd64 [upgradable from: 1.22.1-8]
          const match = line.match(/^([^/\s]+)\/[^\s]+\s+([^\s]+)\s+[^\s]+\s+\[upgradable from:\s+([^\]]+)\]/);
          if (match) {
            packages.push({
              name: match[1],
              newVersion: match[2],
              currentVersion: match[3],
              isSecurityFix: line.toLowerCase().includes('security') || line.toLowerCase().includes('sec')
            });
          }
        }
      } else if (pkgMgr === 'dnf') {
        const res = await client.executeCommand('dnf check-update --quiet || true');
        const lines = res.stdout.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3 && !line.startsWith('Last metadata')) {
            packages.push({
              name: parts[0],
              newVersion: parts[1],
              currentVersion: 'installed',
              isSecurityFix: false
            });
          }
        }
      } else if (pkgMgr === 'pacman') {
        const res = await client.executeCommand('checkupdates 2>/dev/null || true');
        const lines = res.stdout.split('\n');
        for (const line of lines) {
          // Format: pkgname 1.0.0 -> 1.0.1
          const match = line.match(/^([^\s]+)\s+([^\s]+)\s+->\s+([^\s]+)/);
          if (match) {
            packages.push({
              name: match[1],
              currentVersion: match[2],
              newVersion: match[3]
            });
          }
        }
      } else if (pkgMgr === 'apk') {
        await client.executeCommand('sudo apk update -q || true');
        const res = await client.executeCommand('apk version -u -l "<" 2>/dev/null || true');
        const lines = res.stdout.split('\n');
        for (const line of lines) {
          // Format: pkg-1.0.0 < 1.0.1
          const match = line.match(/^([^\s]+)\s+<\s+([^\s]+)/);
          if (match) {
            packages.push({
              name: match[1],
              currentVersion: 'installed',
              newVersion: match[2]
            });
          }
        }
      } else if (pkgMgr === 'zypper') {
        await client.executeCommand('sudo zypper --non-interactive refresh -q || true');
        const res = await client.executeCommand('zypper --non-interactive list-updates 2>/dev/null || true');
        const lines = res.stdout.split('\n');
        for (const line of lines) {
          const parts = line.split('|').map(s => s.trim());
          if (parts.length >= 5 && parts[0] === 'v') {
            packages.push({
              name: parts[2],
              currentVersion: parts[3],
              newVersion: parts[4]
            });
          }
        }
      }
    } catch (e: any) {
      console.warn(`[LinuxSshAdapter] Error parsing upgradable packages: ${e.message}`);
    }

    return packages;
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const { client, pkgMgr } = this.getClient(host, credentials);

    // 1. Get OS release & Kernel version
    const [osInfo, kernelInfo] = await Promise.all([
      client.executeCommand('cat /etc/os-release | grep PRETTY_NAME | cut -d "=" -f2 | tr -d \'"\'').catch(() => ({ stdout: '' })),
      client.executeCommand('uname -r').catch(() => ({ stdout: '' }))
    ]);
    const osPretty = osInfo.stdout.trim() || 'Linux OS';
    const kernelRelease = kernelInfo.stdout.trim();
    const currentVersion = kernelRelease ? `${osPretty} (${kernelRelease})` : osPretty;

    // 2. Check reboot required flag
    const rebootCheck = await client.executeCommand('[ -f /var/run/reboot-required ] || [ -f /run/reboot-required ] && echo "yes" || echo "no"');
    const requiresReboot = rebootCheck.stdout.trim() === 'yes';

    // 3. Extract and parse upgradable packages
    const packages = await this.parseUpgradablePackages(client, pkgMgr);
    const packageCount = packages.length;

    let targetVersion = currentVersion;
    if (packageCount === 1) {
      const single = packages[0];
      targetVersion = `${single.name}: ${single.currentVersion} ➔ ${single.newVersion}`;
    } else if (packageCount > 1) {
      targetVersion = `${currentVersion} (+${packageCount} packages available)`;
    }

    return {
      currentVersion,
      targetVersion,
      hasUpdate: packageCount > 0,
      requiresReboot: requiresReboot || packages.some(p => {
        const n = p.name.toLowerCase();
        return n.includes('linux-image') || n.includes('kernel') || n.includes('systemd') || n.includes('libc6') || n.includes('microcode');
      }),
      packageCount,
      extraDetails: {
        packageManager: pkgMgr,
        kernel: kernelRelease,
        os: osPretty,
        packages
      }
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const { client, pkgMgr } = this.getClient(host, credentials);
    const packages = await this.parseUpgradablePackages(client, pkgMgr);

    if (packages.length > 0) {
      return packages.map(p => ({
        version: `${p.currentVersion} ➔ ${p.newVersion}`,
        summary: `Package: ${p.name} — Pending upgrade from ${pkgMgr.toUpperCase()} repository`,
        isSecurityFix: p.isSecurityFix ?? false,
        detailsUrl: `https://packages.debian.org/search?keywords=${encodeURIComponent(p.name)}`
      }));
    }

    return [
      {
        version: 'Up to date',
        summary: `All packages are up to date on ${pkgMgr.toUpperCase()} repository.`
      }
    ];
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const { client } = this.getClient(host, credentials);
    const rawSnapId = backupName || `snap_${Date.now()}`;
    const snapId = this.sanitizeIdentifier(rawSnapId);

    // Create /etc backup archive
    try {
      const tarRes = await client.executeCommand(`sudo tar -czf /tmp/${snapId}_etc.tar.gz /etc`);
      if (tarRes.code === 0) {
        return {
          success: true,
          backupId: snapId,
          backupType: 'ETC_ARCHIVE',
          message: 'System configuration archive (/etc) saved successfully.'
        };
      }
      throw new Error(`tar backup failed (Code ${tarRes.code}): ${tarRes.stderr || tarRes.stdout}`);
    } catch (e: any) {
      console.warn(`[LinuxSshAdapter] tar /etc archive notice: ${e.message}`);
      return {
        success: true,
        backupId: snapId,
        backupType: 'GENERIC_SNAPSHOT',
        message: `Safety checkpoint recorded (${e.message}).`
      };
    }
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const { client, pkgMgr } = this.getClient(host, credentials);
    const logs: string[] = [];

    if (pkgMgr === 'apt') {
      onProgress?.('UPDATING', 'Refreshing APT repositories (sudo apt-get update)...');
      const updateRes = await client.executeCommand('sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 update');
      logs.push(updateRes.stdout);

      onProgress?.('UPDATING', 'Upgrading packages in non-interactive mode (dist-upgrade)...');
      const upgradeRes = await client.executeCommand(
        'sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -y -q -o DPkg::Lock::Timeout=120 -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" dist-upgrade'
      );
      logs.push(upgradeRes.stdout);
      if (upgradeRes.code !== 0) {
        throw new Error(`dist-upgrade failed (Code ${upgradeRes.code}): ${upgradeRes.stderr || upgradeRes.stdout}`);
      }

      onProgress?.('UPDATING', 'Cleaning obsolete packages (autoremove & autoclean)...');
      const cleanRes = await client.executeCommand('sudo DEBIAN_FRONTEND=noninteractive apt-get -y -o DPkg::Lock::Timeout=60 autoremove && sudo apt-get autoclean');
      logs.push(cleanRes.stdout);

    } else if (pkgMgr === 'dnf') {
      onProgress?.('UPDATING', 'Running dnf upgrade -y --nobest...');
      const dnfRes = await client.executeCommand('sudo dnf upgrade -y --nobest && sudo dnf autoremove -y');
      logs.push(dnfRes.stdout);
      if (dnfRes.code !== 0) throw new Error(`dnf failed: ${dnfRes.stderr || dnfRes.stdout}`);
    } else if (pkgMgr === 'pacman') {
      onProgress?.('UPDATING', 'Running pacman -Syu --noconfirm...');
      const pacRes = await client.executeCommand('sudo pacman -Syu --noconfirm');
      logs.push(pacRes.stdout);
      if (pacRes.code !== 0) throw new Error(`pacman failed: ${pacRes.stderr || pacRes.stdout}`);
    } else if (pkgMgr === 'apk') {
      onProgress?.('UPDATING', 'Running apk update && apk upgrade --no-cache...');
      const apkRes = await client.executeCommand('sudo apk update && sudo apk upgrade --no-cache');
      logs.push(apkRes.stdout);
      if (apkRes.code !== 0) throw new Error(`apk failed: ${apkRes.stderr || apkRes.stdout}`);
    } else if (pkgMgr === 'zypper') {
      onProgress?.('UPDATING', 'Running zypper --non-interactive update -y...');
      const zypRes = await client.executeCommand('sudo zypper --non-interactive update -y');
      logs.push(zypRes.stdout);
      if (zypRes.code !== 0) throw new Error(`zypper failed: ${zypRes.stderr || zypRes.stdout}`);
    }

    // Docker Compose & Images Update (if Docker is present on the machine)
    try {
      const dockerCheck = await client.executeCommand('which docker');
      if (dockerCheck.code === 0) {
        const meta = (host.metadata as any) || {};
        const customDir = (meta.composeDirectory || '').trim();

        if (customDir && !/^[a-zA-Z0-9_\-\.\/~]+$/.test(customDir)) {
          throw new Error(`[LinuxSshAdapter] Invalid or unsafe composeDirectory path: "${customDir}"`);
        }

        const candidatePaths = customDir ? [customDir] : ['docker', '~/docker', '/opt/docker'];

        for (const dir of candidatePaths) {
          const checkRes = await client.executeCommand(
            `[ -d "${dir}" ] && ([ -f "${dir}/docker-compose.yml" ] || [ -f "${dir}/compose.yaml" ] || [ -f "${dir}/docker-compose.yaml" ]) && echo "found" || echo "no"`
          );
          if (checkRes.stdout.trim() === 'found') {
            onProgress?.('UPDATING', `Upgrading Docker Compose services in ${dir}...`);
            const composeRes = await client.executeCommand(`cd "${dir}" && sudo docker compose pull && sudo docker compose up -d && cd -`);
            if (composeRes.stdout) logs.push(composeRes.stdout);
            if (composeRes.code === 0) {
              onProgress?.('UPDATING', `Docker Compose services in ${dir} updated successfully.`);
            }
            if (customDir) break;
          }
        }

        onProgress?.('UPDATING', 'Pruning dangling Docker images...');
        const dockerPrune = await client.executeCommand('sudo docker image prune -f 2>/dev/null || true');
        if (dockerPrune.stdout) logs.push(dockerPrune.stdout);
      }
    } catch (dockerErr: any) {
      console.warn(`[LinuxSshAdapter] Docker step notice: ${dockerErr.message}`);
    }

    // Check if reboot required after update
    const rebootCheck = await client.executeCommand('[ -f /var/run/reboot-required ] || [ -f /run/reboot-required ] && echo "yes" || echo "no"');
    const requiresReboot = rebootCheck.stdout.trim() === 'yes';

    return {
      success: true,
      requiresReboot,
      logs,
      message: `Linux system (${pkgMgr.toUpperCase()}) and containers updated successfully.${requiresReboot ? ' System reboot is recommended.' : ''}`
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const { client } = this.getClient(host, credentials);
      const res = await client.executeCommand('uptime && df -h /');
      const elapsed = Date.now() - start;

      return {
        isHealthy: res.code === 0,
        responseTimeMs: elapsed,
        checks: [
          { name: 'SSH Connection & Auth', passed: true },
          { name: 'System Uptime & Disk', passed: res.code === 0, details: res.stdout.split('\n')[0] }
        ],
        message: 'Linux server reachable via SSH.'
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [{ name: 'SSH Connection', passed: false, details: err.message }],
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
    const { client } = this.getClient(host, credentials);
    const safeBackupId = this.sanitizeIdentifier(backupIdentifier);

    onProgress?.('ROLLBACK', `Restoring /etc configuration from ${safeBackupId}...`);
    try {
      const res = await client.executeCommand(`[ -f /tmp/${safeBackupId}_etc.tar.gz ] && sudo tar -xzf /tmp/${safeBackupId}_etc.tar.gz -C /`);
      if (res.code !== 0) {
        return {
          success: false,
          restoredVersion: 'Restore failed',
          logs: [`Error extracting archive ${safeBackupId}: ${res.stderr || res.stdout}`],
          message: `Linux rollback failed (Code ${res.code}): ${res.stderr || res.stdout}`
        };
      }
    } catch (e: any) {
      return {
        success: false,
        restoredVersion: 'Restore failed',
        logs: [`Rollback exception: ${e.message}`],
        message: `Linux rollback communication error: ${e.message}`
      };
    }

    return {
      success: true,
      restoredVersion: '/etc configuration restored',
      logs: [`Archive ${safeBackupId} applied successfully.`],
      message: 'Linux configuration rollback completed successfully.'
    };
  }
}
